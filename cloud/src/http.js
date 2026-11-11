// Small helpers shared by the routes: JSON responses, bearer auth.
//
// No CORS headers on purpose: the config UI is served from this same Worker
// (same origin) and the Pi isn't a browser, so no other origin ever needs to
// read these responses.

export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json', 'cache-control': 'no-store', ...SECURITY_HEADERS, ...headers},
  });
}

export function error(message, status, extra = {}) {
  return json({error: message, ...extra}, status);
}

export async function readJson(request, maxBytes = 512 * 1024) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new HttpError('payload too large', 413);
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError('payload too large', 413);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new HttpError('invalid json', 400);
  }
}

export class HttpError extends Error {
  constructor(message, status, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

async function sha256(text) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
}

// Constant-time comparison so a token can't be guessed byte by byte from
// response timing. Both sides are hashed first, so the comparison is always
// over 32 bytes and doesn't leak the secret's length either.
async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

function bearer(request) {
  const auth = request.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

// Which secret a request must carry. The device token and the admin token
// are deliberately separate secrets: a token lifted off the Pi can't change
// the config, and a leaked admin token can't forge device stats. An unset
// secret (or an empty bearer) never authenticates.
async function hasToken(request, secret) {
  const given = bearer(request);
  if (!secret || !given) return false;
  return safeEqual(given, secret);
}

export function isDevice(request, env) {
  return hasToken(request, env.DEVICE_TOKEN);
}

export function isAdmin(request, env) {
  return hasToken(request, env.ADMIN_TOKEN);
}

// Who published a config version. If Cloudflare Access is put in front of
// the Worker it adds this header; otherwise there's one shared admin token.
// Only a label: without Access in front, any admin-token holder could set it.
export function authorOf(request) {
  return (request.headers.get('cf-access-authenticated-user-email') || 'admin').slice(0, 200);
}
