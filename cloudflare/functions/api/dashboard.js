// GET /api/dashboard
//
// Public, read-only endpoint. Returns everything the static dashboard needs
// in one call: bot online status, bottle fill levels, available recipes,
// and lifetime usage stats.

const ONLINE_WINDOW_MS = 3 * 60 * 1000; // consider offline if no report in 3 min

export async function onRequestGet(context) {
  const {env} = context;
  const db = env.DB;

  const status = await db
    .prepare('SELECT online, last_seen, drinks_served, alcohol_served_ml FROM status WHERE id = 1')
    .first();

  const bottles = await db
    .prepare('SELECT name, capacity_ml, original_capacity_ml, serving_ml, updated_at FROM bottles ORDER BY name')
    .all();

  const recipes = await db
    .prepare('SELECT id, friendly_name, image_url, ingredients_json, updated_at FROM recipes ORDER BY friendly_name')
    .all();

  const recentPours = await db
    .prepare('SELECT drink_name, friendly_name, alcohol_ml, poured_at FROM pours ORDER BY poured_at DESC LIMIT 20')
    .all();

  const lastSeenMs = status?.last_seen ? Date.parse(status.last_seen) : 0;
  const isOnline = Boolean(status?.online) && Date.now() - lastSeenMs < ONLINE_WINDOW_MS;

  const body = {
    status: {
      online: isOnline,
      lastSeen: status?.last_seen ?? null,
      drinksServed: status?.drinks_served ?? 0,
      alcoholServedMl: status?.alcohol_served_ml ?? 0,
    },
    bottles: (bottles.results ?? []).map((b) => ({
      name: b.name,
      capacityMl: b.capacity_ml,
      originalCapacityMl: b.original_capacity_ml,
      servingMl: b.serving_ml,
      updatedAt: b.updated_at,
    })),
    recipes: (recipes.results ?? []).map((r) => ({
      id: r.id,
      friendlyName: r.friendly_name,
      imageUrl: r.image_url,
      ingredients: JSON.parse(r.ingredients_json),
      updatedAt: r.updated_at,
    })),
    recentPours: recentPours.results ?? [],
  };

  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  });
}
