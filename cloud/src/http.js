// Small helpers shared by the routes: JSON responses, CORS, bearer auth.

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, if-none-match',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  'access-control-expose-headers': 'etag',
};

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json', 'cache-control': 'no-store', ...CORS, ...headers},
  });
}

export function error(message, status, extra = {}) {
  return json({error: message, ...extra}, status);
}

export function preflight() {
  return new Response(null, {status: 204, headers: CORS});
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

// Constant-time comparison so a token can't be guessed byte by byte from
// response timing. Lengths are compared first (that leaks only the length).
function safeEqual(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  return crypto.subtle.timingSafeEqual(ab, bb);
}

function bearer(request) {
  const auth = request.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

// Which secret a request must carry. The device token and the admin token
// are deliberately separate secrets: a token lifted off the Pi can't change
// the config, and a leaked admin token can't forge device stats.
export function isDevice(request, env) {
  return Boolean(env.DEVICE_TOKEN) && safeEqual(bearer(request), env.DEVICE_TOKEN);
}

export function isAdmin(request, env) {
  return Boolean(env.ADMIN_TOKEN) && safeEqual(bearer(request), env.ADMIN_TOKEN);
}

// Who published a config version. If Cloudflare Access is put in front of
// the Worker it adds this header; otherwise there's one shared admin token.
export function authorOf(request) {
  return request.headers.get('cf-access-authenticated-user-email') || 'admin';
}
