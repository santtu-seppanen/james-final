// POST /api/report
//
// Called by the Pi's backend (see server/reporter.js) every minute or so.
// Requires a shared-secret bearer token (REPORT_TOKEN) so randoms can't
// overwrite the public dashboard's data - reads stay public, writes don't.
//
// Expected JSON body:
// {
//   "status": {"drinksServed": 12, "alcoholServedMl": 480},
//   "bottles": [{"name": "vodka", "capacityMl": 700, "originalCapacityMl": 1000, "servingMl": 25}, ...],
//   "recipes": [{"id": "123", "friendlyName": "Moukku", "imageUrl": "moukku", "ingredients": [...]}],
//   "pour": {"drinkName": "123", "friendlyName": "Moukku", "alcoholMl": 40}  // optional, only on an actual pour
// }

export async function onRequestPost(context) {
  const {request, env} = context;
  const db = env.DB;

  const auth = request.headers.get('authorization') || '';
  const expected = `Bearer ${env.REPORT_TOKEN}`;
  if (!env.REPORT_TOKEN || auth !== expected) {
    return new Response(JSON.stringify({error: 'unauthorized'}), {
      status: 401,
      headers: {'content-type': 'application/json'},
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({error: 'invalid json'}), {
      status: 400,
      headers: {'content-type': 'application/json'},
    });
  }

  const now = new Date().toISOString();
  const statements = [];

  statements.push(
    db
      .prepare(
        `UPDATE status SET online = 1, last_seen = ?, drinks_served = ?, alcohol_served_ml = ? WHERE id = 1`,
      )
      .bind(now, payload.status?.drinksServed ?? 0, payload.status?.alcoholServedMl ?? 0),
  );

  for (const bottle of payload.bottles ?? []) {
    statements.push(
      db
        .prepare(
          `INSERT INTO bottles (name, capacity_ml, original_capacity_ml, serving_ml, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(name) DO UPDATE SET
             capacity_ml = excluded.capacity_ml,
             original_capacity_ml = excluded.original_capacity_ml,
             serving_ml = excluded.serving_ml,
             updated_at = excluded.updated_at`,
        )
        .bind(bottle.name, bottle.capacityMl, bottle.originalCapacityMl, bottle.servingMl, now),
    );
  }

  for (const recipe of payload.recipes ?? []) {
    statements.push(
      db
        .prepare(
          `INSERT INTO recipes (id, friendly_name, image_url, ingredients_json, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             friendly_name = excluded.friendly_name,
             image_url = excluded.image_url,
             ingredients_json = excluded.ingredients_json,
             updated_at = excluded.updated_at`,
        )
        .bind(recipe.id, recipe.friendlyName, recipe.imageUrl ?? null, JSON.stringify(recipe.ingredients ?? []), now),
    );
  }

  if (payload.pour) {
    statements.push(
      db
        .prepare(`INSERT INTO pours (drink_name, friendly_name, alcohol_ml, poured_at) VALUES (?, ?, ?, ?)`)
        .bind(payload.pour.drinkName, payload.pour.friendlyName ?? null, payload.pour.alcoholMl ?? 0, now),
    );
  }

  await db.batch(statements);

  return new Response(JSON.stringify({ok: true}), {
    headers: {'content-type': 'application/json'},
  });
}
