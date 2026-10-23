// /api/admin/bottles
//
// Queues a bottle edit for the Pi, same mechanism as admin/recipes.js.
// ADMIN_TOKEN protected. The Pi re-validates (name must be one of its
// available bottles, serving 25 or 50, ...).
//
//   POST {"slot": 2, "bottle": {"name": "vodka", "capacity": 700, "serving": 25}}

import {json, isAdmin, preflight} from '../../_lib/admin.js';

const MAX_PENDING = 50;

export const onRequestOptions = preflight;

export async function onRequestPost({request, env}) {
  if (!isAdmin(request, env)) return json({error: 'unauthorized'}, 401);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({error: 'invalid json'}, 400);
  }

  const {slot, bottle} = body ?? {};
  const ok =
    Number.isInteger(slot) &&
    slot >= 0 &&
    slot < 32 &&
    bottle &&
    typeof bottle.name === 'string' &&
    Number.isFinite(Number(bottle.capacity)) &&
    Number.isFinite(Number(bottle.serving));
  if (!ok) return json({error: 'slot and bottle {name, capacity, serving} required'}, 400);

  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM bottle_commands WHERE status = 'pending'").first();
  if (pending.n >= MAX_PENDING) return json({error: 'too many pending edits - is the bot offline?'}, 429);

  const result = await env.DB.prepare('INSERT INTO bottle_commands (slot, bottle_json, created_at) VALUES (?, ?, ?)')
    .bind(slot, JSON.stringify({name: bottle.name, capacity: Number(bottle.capacity), serving: Number(bottle.serving)}), new Date().toISOString())
    .run();

  return json({ok: true, id: result.meta.last_row_id}, 202);
}
