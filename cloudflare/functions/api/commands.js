// /api/commands
//
// The Pi's side of the recipe-edit queue (see admin/recipes.js).
// Bearer-token protected with REPORT_TOKEN, like /api/report.
//
//   GET  -> {"commands": [{id, op, recipeId, recipe}]}  (pending, oldest first)
//   POST {"results": [{"id": 1, "ok": true}, {"id": 2, "ok": false, "error": "..."}]}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type': 'application/json', 'cache-control': 'no-store'},
  });
}

function isAuthorized(request, env) {
  return Boolean(env.REPORT_TOKEN) && request.headers.get('authorization') === `Bearer ${env.REPORT_TOKEN}`;
}

export async function onRequestGet({request, env}) {
  if (!isAuthorized(request, env)) return json({error: 'unauthorized'}, 401);

  const rows = await env.DB.prepare(
    "SELECT id, op, recipe_id, recipe_json FROM recipe_commands WHERE status = 'pending' ORDER BY id LIMIT 20",
  ).all();

  return json({
    commands: (rows.results ?? []).map((r) => ({
      id: r.id,
      op: r.op,
      recipeId: r.recipe_id,
      recipe: r.recipe_json ? JSON.parse(r.recipe_json) : null,
    })),
  });
}

export async function onRequestPost({request, env}) {
  if (!isAuthorized(request, env)) return json({error: 'unauthorized'}, 401);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({error: 'invalid json'}, 400);
  }

  const now = new Date().toISOString();
  const statements = (body?.results ?? []).map((r) =>
    env.DB.prepare(
      "UPDATE recipe_commands SET status = ?, error = ?, resolved_at = ? WHERE id = ? AND status = 'pending'",
    ).bind(r.ok ? 'applied' : 'failed', r.ok ? null : String(r.error ?? 'failed').slice(0, 200), now, r.id),
  );
  if (statements.length > 0) await env.DB.batch(statements);

  return json({ok: true});
}
