import type {Bottle, PourResult, Recipe} from './types';

// The kiosk browser and the backend both run on the Pi, but on different
// ports served by different things (nghttpx on :3000 only proxies to the
// static file server on :80 - it never touches the Express backend on
// :8000). So this always needs to be absolute, same as the old app.
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(API_BASE + path);
  const text = await response.json();
  // The backend double-encodes most GET responses (res.json(data) where
  // data is already a JSON string) - JSON.parse twice to match.
  return typeof text === 'string' ? JSON.parse(text) : text;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(API_BASE + path, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(body),
  });
  const text = await response.json();
  return typeof text === 'string' ? JSON.parse(text) : text;
}

export function getBottles(): Promise<Bottle[]> {
  return getJson('/getBottles');
}

export function getRecipes(): Promise<Recipe[]> {
  return getJson('/getRecipes');
}

export function getAvailableBottleNames(): Promise<string[]> {
  return getJson('/getAvailableBottles');
}

export function setBottles(bottles: Bottle[]): Promise<Bottle[]> {
  return postJson('/setBottles', bottles);
}

export function setRecipes(recipes: Recipe[]): Promise<Recipe[]> {
  return postJson('/setRecipes', recipes);
}

export function pourByName(drinkName: string): Promise<PourResult> {
  return postJson('/drinkme', {drink: drinkName});
}

export function pourAdHoc(recipe: Recipe): Promise<PourResult> {
  return postJson('/drinkme', {recipe});
}

export function generateAiDrink(): Promise<Recipe> {
  return fetch(API_BASE + '/api/generate-drink', {method: 'POST'}).then(async (response) => {
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || 'Failed to generate a drink');
    }
    return body as Recipe;
  });
}

export function saveRecipe(name: string, recipe: Recipe): Promise<{id: string; friendlyname: string}> {
  return fetch(API_BASE + '/api/save-recipe', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({name, recipe}),
  }).then(async (response) => {
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || 'Failed to save recipe');
    }
    return body;
  });
}

export function getVersion(): Promise<{version: string}> {
  return fetch(API_BASE + '/api/version').then((r) => r.json());
}

export {API_BASE};
