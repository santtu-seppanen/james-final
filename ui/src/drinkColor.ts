import type {Bottle, Ingredient, Recipe} from './types';

// Colour per bottle name (issue #2). Drink colour = volume-weighted
// average of its ingredients, normalised so the brightest channel is 255
// so a splash of syrup in a lot of tonic still reads as a colour rather
// than grey. Same table is meant to drive the LED segments later.
const INGREDIENT_COLORS: Record<string, [number, number, number]> = {
  cranberry: [220, 30, 70],
  orangejuice: [255, 150, 20],
  orange: [255, 150, 20],
  pineapplejuice: [255, 220, 70],
  applejuice: [200, 230, 90],
  limejuice: [120, 220, 60],
  lime: [120, 220, 60],
  syrup: [255, 90, 160],
  coke: [90, 45, 25],
  tonic: [180, 220, 255],
  sprite: [200, 240, 230],
  lemonade: [230, 240, 180],
  grapefruitsoda: [255, 170, 150],
  grapefuitsoda: [255, 170, 150],
  vodka: [190, 220, 255],
  gin: [190, 230, 240],
  tequila: [240, 220, 150],
  rum: [200, 120, 50],
  whiskey: [200, 110, 30],
  jaloviina: [210, 130, 40],
  bols: [60, 150, 230],
  carillo: [230, 60, 60],
};

// Issue #19's list of what counts as alcohol, by bottle name.
const ALCOHOL = new Set(['vodka', 'gin', 'rum', 'whiskey', 'tequila', 'jaloviina', 'bols', 'carillo']);

export function normaliseName(name: string): string {
  return String(name).toLowerCase().replace(/\s+/g, '');
}

export function isAlcohol(name: string): boolean {
  return ALCOHOL.has(normaliseName(name));
}

export function ingredientColor(name: string): [number, number, number] | null {
  const key = normaliseName(name);
  if (INGREDIENT_COLORS[key]) return INGREDIENT_COLORS[key];
  // "lemonade of your choosing" and friends - match on a leading word.
  for (const known in INGREDIENT_COLORS) {
    if (key.startsWith(known)) return INGREDIENT_COLORS[known];
  }
  return null;
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function drinkColor(recipe: Recipe): [number, number, number] {
  if (recipe.color) {
    const override = parseHex(recipe.color);
    if (override) return override;
  }

  let total = 0;
  const sum = [0, 0, 0];
  for (const ing of recipe.ingredients) {
    const c = ingredientColor(ing.name);
    const ml = Number(ing.serving) || 0;
    if (!c || ml <= 0) continue;
    total += ml;
    sum[0] += c[0] * ml;
    sum[1] += c[1] * ml;
    sum[2] += c[2] * ml;
  }
  if (total === 0) return [27, 149, 224]; // brand blue as the neutral fallback

  const avg = sum.map((v) => v / total);
  const max = Math.max(...avg) || 1;
  return avg.map((v) => Math.round((v / max) * 255)) as [number, number, number];
}

export function rgbString(c: [number, number, number], alpha = 1): string {
  return alpha >= 1 ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}

export function toHex(c: [number, number, number]): string {
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Strength hint shown on the menu card: share of alcohol by volume.
export type StrengthHint = 'mocktail' | 'light' | 'regular' | 'strong';

export const STRENGTH_LABEL: Record<StrengthHint, string> = {
  mocktail: 'Mocktail',
  light: 'Light',
  regular: 'Regular',
  strong: 'Strong',
};

export function strengthHint(ingredients: Ingredient[]): StrengthHint {
  let alcohol = 0;
  let total = 0;
  for (const ing of ingredients) {
    const ml = Number(ing.serving) || 0;
    total += ml;
    if (isAlcohol(ing.name)) alcohol += ml;
  }
  if (alcohol === 0) return 'mocktail';
  const share = alcohol / total;
  if (share < 0.25) return 'light';
  if (share < 0.45) return 'regular';
  return 'strong';
}

// --- Bottle levels -------------------------------------------------------

export const LOW_FILL_THRESHOLD = 0.2;

export interface BottleLevel {
  ratio: number; // 0..1 of originalCapacity
  isLow: boolean;
  isEmpty: boolean; // dry or an unused "empty" slot
  isSlotUnused: boolean;
}

export function bottleLevel(bottle: Bottle): BottleLevel {
  const capacity = Number(bottle.capacity) || 0;
  const original = Number(bottle.originalCapacity) || capacity;
  const serving = Number(bottle.serving) || 0;
  const ratio = original > 0 ? Math.max(0, Math.min(1, capacity / original)) : 0;
  const isSlotUnused = normaliseName(bottle.name) === 'empty' || !bottle.name;
  const isEmpty = isSlotUnused || capacity < serving || capacity <= 0;
  return {ratio, isLow: !isEmpty && ratio <= LOW_FILL_THRESHOLD, isEmpty, isSlotUnused};
}

export function findBottle(bottles: Bottle[], ingredientName: string): Bottle | undefined {
  const key = normaliseName(ingredientName);
  return bottles.find((b) => normaliseName(b.name) === key);
}

export interface Availability {
  pourable: boolean;
  missing: string[]; // bottles that are dry or not loaded
  low: string[]; // loaded but under the low threshold
}

// The backend already filters the menu by which bottles are loaded, but
// not by how much is left in them - do that here so the menu only offers
// what can actually be poured (prompt: "only those pourable").
export function availability(recipe: Recipe, bottles: Bottle[]): Availability {
  const missing: string[] = [];
  const low: string[] = [];
  for (const ing of recipe.ingredients) {
    if (ing.manual) continue;
    const bottle = findBottle(bottles, ing.name);
    if (!bottle || Number(bottle.capacity) < Number(ing.serving)) {
      missing.push(ing.name);
    } else if (bottleLevel(bottle).isLow) {
      low.push(ing.name);
    }
  }
  return {pourable: missing.length === 0, missing, low};
}
