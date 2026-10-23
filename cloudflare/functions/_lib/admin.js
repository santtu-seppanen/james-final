// Shared by the dashboard's admin endpoints (admin/recipes.js, admin/bottles.js).

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json', 'cache-control': 'no-store', ...CORS},
  });
}

export function isAdmin(request, env) {
  return Boolean(env.ADMIN_TOKEN) && request.headers.get('authorization') === `Bearer ${env.ADMIN_TOKEN}`;
}

export function preflight() {
  return new Response(null, {status: 204, headers: CORS});
}
