import type {Bottle, Recipe} from './types';

// Shot mode ("5 viinaa"): five shot glasses on the belt, filled one at a
// time from one bottle. Same rule as server/shots.js: 25 ml bottles with
// enough left for all five glasses.
export const SHOT_COUNT = 5;
export const SHOT_PREFIX = 'shot:';

// One pseudo-recipe per bottle name so the carousel and the pour screens can
// treat a shot bottle like any other drink.
export function shotRecipes(bottles: Bottle[]): Recipe[] {
  const seen = new Set<string>();
  const list: Recipe[] = [];
  for (const bottle of bottles) {
    const name = String(bottle.name);
    if (name.toLowerCase() === 'empty' || seen.has(name.toLowerCase())) continue;
    if (Number(bottle.serving) !== 25 || Number(bottle.capacity) < 25 * SHOT_COUNT) continue;
    seen.add(name.toLowerCase());
    list.push({
      name: SHOT_PREFIX + name,
      friendlyname: name.charAt(0).toUpperCase() + name.slice(1),
      ingredients: [{name, serving: 25 * SHOT_COUNT}],
      imageUrl: 'bottle:' + name,
      subtitle: SHOT_COUNT + ' × 25 ml',
    });
  }
  return list;
}

export function shotBottleName(recipe: Recipe): string | null {
  return recipe.name && recipe.name.startsWith(SHOT_PREFIX) ? recipe.name.slice(SHOT_PREFIX.length) : null;
}
