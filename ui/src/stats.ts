import type {Bottle, Recipe} from './types';
import {findBottle} from './drinkColor';

// The backend keeps metrics.json for the public dashboard but doesn't
// serve it to the kiosk, so the attract screen's "Top 5 tonight" and the
// admin Stats tab count what *this kiosk* has poured, in localStorage.
// Issue #15 will move this server-side; the shapes here are deliberately
// small so that swap is cheap.
const KEY = 'james.pours.v1';
const MAX_ENTRIES = 1000;

export interface PourEntry {
  at: number; // ms since epoch
  name: string; // recipe id or friendlyname for ad-hoc
  friendlyname: string;
  ml: Record<string, number>; // per bottle name
}

function read(): PourEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(entries: PourEntry[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // Private mode / quota - stats are a nicety, never block a pour on them.
  }
}

export function recordPour(recipe: Recipe, bottles: Bottle[]) {
  const ml: Record<string, number> = {};
  for (const ing of recipe.ingredients) {
    if (ing.manual) continue;
    const bottle = findBottle(bottles, ing.name);
    if (bottle) ml[bottle.name] = (ml[bottle.name] || 0) + Number(ing.serving);
  }
  write([...read(), {at: Date.now(), name: recipe.name || recipe.friendlyname, friendlyname: recipe.friendlyname, ml}]);
}

export function clearStats() {
  write([]);
}

// "Tonight" = since 6 am today, or since 6 am yesterday if it's before 6.
export function tonightStart(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(6, 0, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export function poursSince(since: number): PourEntry[] {
  return read().filter((e) => e.at >= since);
}

export function topDrinks(since: number, limit = 5): {friendlyname: string; count: number}[] {
  const counts: Record<string, number> = {};
  for (const e of poursSince(since)) counts[e.friendlyname] = (counts[e.friendlyname] || 0) + 1;
  return Object.keys(counts)
    .map((friendlyname) => ({friendlyname, count: counts[friendlyname]}))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function consumptionSince(since: number): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const e of poursSince(since)) {
    for (const bottle in e.ml) totals[bottle] = (totals[bottle] || 0) + e.ml[bottle];
  }
  return totals;
}

// Rough "days until empty" from the last 7 days of pours on this kiosk.
export function daysUntilEmpty(bottle: Bottle, now = Date.now()): number | null {
  const week = 7 * 24 * 3600 * 1000;
  const entries = poursSince(now - week);
  if (entries.length === 0) return null;
  const used = entries.reduce((sum, e) => sum + (e.ml[bottle.name] || 0), 0);
  if (used <= 0) return null;
  const spanDays = Math.max(1, (now - entries[0].at) / (24 * 3600 * 1000));
  const perDay = used / spanDays;
  return Math.round(Number(bottle.capacity) / perDay);
}
