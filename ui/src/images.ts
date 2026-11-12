// Vite import.meta.glob pulls in every asset under these folders and maps
// filename (no extension) -> resolved URL, so new images just need to be
// dropped in the folder - no import list to maintain by hand.
const drinkModules = import.meta.glob('./assets/drinks/*.{png,jpg,jpeg}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const bottleModules = import.meta.glob('./assets/bottles/*.{png,jpg,jpeg}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

function toNameMap(modules: Record<string, string>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const path in modules) {
    const fileName = path.split('/').pop() || '';
    const name = fileName.replace(/\.(png|jpg|jpeg)$/, '');
    map[name] = modules[path];
  }
  return map;
}

export const drinkImages = toNameMap(drinkModules);
export const bottleImages = toNameMap(bottleModules);

export const fallbackDrinkImage = drinkImages['drink'];
export const fallbackBottleImage = bottleImages['bottle'];

// 'bottle:vodka' points at a bottle picture (shot mode); anything else is a drink picture.
export function recipeImage(recipe: {imageUrl?: string}): string {
  if (recipe.imageUrl && recipe.imageUrl.startsWith('bottle:')) {
    return bottleImages[recipe.imageUrl.slice(7).toLowerCase()] || fallbackBottleImage;
  }
  return (recipe.imageUrl && drinkImages[recipe.imageUrl]) || fallbackDrinkImage;
}

// AI drinks come without a picture: borrow the one that fits the main spirit.
const AI_PICTURES: [RegExp, string][] = [
  [/vodka/i, 'vodka'],
  [/whisk/i, 'whiskey'],
  [/rum/i, 'rum_coke'],
  [/gin/i, 'gin_tonic'],
  [/tequila/i, 'margarita'],
  [/cranberry/i, 'red_drink'],
];

export function aiDrinkPicture(ingredients: {name: string; manual?: boolean}[]): string {
  for (const ing of ingredients) {
    if (ing.manual) continue;
    const hit = AI_PICTURES.find(([pattern]) => pattern.test(ing.name));
    if (hit && drinkImages[hit[1]]) return hit[1];
  }
  return 'drink';
}
