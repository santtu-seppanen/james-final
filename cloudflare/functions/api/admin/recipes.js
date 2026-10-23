// /api/admin/recipes
//
// Lets the public dashboard edit the Pi's recipes. The Pi isn't reachable
// from the internet, so edits go into a queue (recipe_commands) that the Pi
// polls (see functions/api/commands.js and server/reporter.js). The Pi
// re-validates everything; the checks here just give fast feedback.
//
// Protected by ADMIN_TOKEN (a separate secret from REPORT_TOKEN, so a
// leaked Pi token can't be used from a browser and vice versa).
//
//   POST {"op": "upsert", "recipeId": "123"?, "recipe": {"friendlyname": "...", "ingredients": [{"name": "vodka", "serving": 50}]}}
//   POST {"op": "delete", "recipeId": "123"}
//   GET  -> the 20 most recent commands with their status

const MAX_PENDING = 50;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json', 'cache-control': 'no-store', ...CORS},
  });
}

function isAuthorized(request, env) {
  return Boolean(env.ADMIN_TOKEN) && request.headers.get('authorization') === `Bearer ${env.ADMIN_TOKEN}`;
}

export async function onRequestOptions() {
  return new Response(null, {status: 204, headers: CORS});
}

export async function onRequestGet({request, env}) {
  if (!isAuthorized(request, env)) return json({error: 'unauthorized'}, 401);

  const rows = await env.DB.prepare(
    'SELECT id, op, recipe_id, status, error, created_at FROM recipe_commands ORDER BY id DESC LIMIT 20',
  ).all();
  return json({commands: rows.results ?? []});
}

export async function onRequestPost({request, env}) {
  if (!isAuthorized(request, env)) return json({error: 'unauthorized'}, 401);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({error: 'invalid json'}, 400);
  }

  const {op, recipeId, recipe} = body ?? {};
  if (op !== 'upsert' && op !== 'delete') return json({error: 'op must be upsert or delete'}, 400);
  if (op === 'delete' && !recipeId) return json({error: 'recipeId required'}, 400);
  if (op === 'upsert') {
    const ok =
      recipe &&
      typeof recipe.friendlyname === 'string' &&
      recipe.friendlyname.trim() &&
      Array.isArray(recipe.ingredients) &&
      recipe.ingredients.length >= 1 &&
      recipe.ingredients.length <= 10;
    if (!ok) return json({error: 'recipe needs a name and 1-10 ingredients'}, 400);
  }

  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM recipe_commands WHERE status = 'pending'").first();
  if (pending.n >= MAX_PENDING) return json({error: 'too many pending edits - is the bot offline?'}, 429);

  const result = await env.DB.prepare(
    'INSERT INTO recipe_commands (op, recipe_id, recipe_json, created_at) VALUES (?, ?, ?, ?)',
  )
    .bind(op, recipeId ? String(recipeId) : null, recipe ? JSON.stringify(recipe) : null, new Date().toISOString())
    .run();

  return json({ok: true, id: result.meta.last_row_id}, 202);
}
