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
