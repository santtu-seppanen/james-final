import {useEffect, useState} from 'react';
import type {Ingredient, Recipe} from '../types';
import {drinkImages, fallbackDrinkImage} from '../images';
import {getAvailableBottleNames, getRecipes, setRecipes} from '../api';
import {PinPad} from './PinPad';

const IMAGE_CHOICES = Object.keys(drinkImages);
const SERVING_SIZES = Array.from({length: 15}, (_, i) => (i + 1) * 10);

function emptyRecipe(): Recipe {
  return {friendlyname: '', ingredients: [], imageUrl: IMAGE_CHOICES[0]};
}

export function RecipeAdmin({onBack}: {onBack: () => void}) {
  const [authorised, setAuthorised] = useState(false);
  const [recipes, setLocalRecipes] = useState<Recipe[]>([]);
  const [bottleNames, setBottleNames] = useState<string[]>([]);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (authorised) {
      getRecipes().then(setLocalRecipes);
      getAvailableBottleNames().then(setBottleNames);
    }
  }, [authorised]);

  function updateIngredient(index: number, patch: Partial<Ingredient>) {
    if (!editing) return;
    const ingredients = editing.ingredients.map((ing, i) => (i === index ? {...ing, ...patch} : ing));
    setEditing({...editing, ingredients});
  }

  function addIngredient() {
    if (!editing) return;
    setEditing({
      ...editing,
      ingredients: [...editing.ingredients, {name: bottleNames[0] || '', serving: 10}],
    });
  }

  function removeIngredient(index: number) {
    if (!editing) return;
    setEditing({...editing, ingredients: editing.ingredients.filter((_, i) => i !== index)});
  }

  async function saveEditing() {
    if (!editing || !editing.friendlyname.trim() || editing.ingredients.length === 0) return;

    const isNew = !editing.name;
    const withName: Recipe = isNew ? {...editing, name: String(Date.now())} : editing;
    const next = isNew
      ? [...recipes, withName]
      : recipes.map((r) => (r.name === withName.name ? withName : r));

    const updated = await setRecipes(next);
    setLocalRecipes(updated);
    setEditing(null);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  if (!authorised) {
    return (
      <div className="screen">
        <PinPad onAuthorised={() => setAuthorised(true)} onBack={onBack} />
      </div>
    );
  }

  if (editing) {
    return (
      <div className="screen">
        <h2>{editing.name ? 'Edit recipe' : 'New recipe'}</h2>
        <label className="field">
          Name
          <input
            value={editing.friendlyname}
            onChange={(e) => setEditing({...editing, friendlyname: e.target.value})}
          />
        </label>
        <label className="field">
          Image
          <select
            value={editing.imageUrl}
            onChange={(e) => setEditing({...editing, imageUrl: e.target.value})}>
            {IMAGE_CHOICES.map((img) => (
              <option key={img} value={img}>
                {img}
              </option>
            ))}
          </select>
        </label>

        <h3>Ingredients</h3>
        {editing.ingredients.map((ing, index) => (
          <div key={index} className="ingredient-row">
            <select
              value={ing.name}
              onChange={(e) => updateIngredient(index, {name: e.target.value})}>
              {bottleNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={ing.serving}
              onChange={(e) => updateIngredient(index, {serving: Number(e.target.value)})}>
              {SERVING_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}ml
                </option>
              ))}
            </select>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={!!ing.manual}
                onChange={(e) => updateIngredient(index, {manual: e.target.checked})}
              />
              Manual
            </label>
            <button className="button button--small" onClick={() => removeIngredient(index)}>
              Remove
            </button>
          </div>
        ))}
        <button className="button button--small" onClick={addIngredient}>
          + Add ingredient
        </button>

        <div className="screen__actions">
          <button className="button button--primary" onClick={saveEditing}>
            Save
          </button>
          <button className="button" onClick={() => setEditing(null)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <h2>Recipes</h2>
      <div className="recipe-grid">
        {recipes.map((recipe) => (
          <button key={recipe.name} className="recipe-card" onClick={() => setEditing(recipe)}>
            <img
              src={(recipe.imageUrl && drinkImages[recipe.imageUrl]) || fallbackDrinkImage}
              alt=""
              className="recipe-card__image"
            />
            <span className="recipe-card__name">{recipe.friendlyname}</span>
          </button>
        ))}
        <button className="recipe-card recipe-card--add" onClick={() => setEditing(emptyRecipe())}>
          + New recipe
        </button>
      </div>
      <div className="screen__actions">
        <button className="button" onClick={onBack}>
          Back
        </button>
      </div>
      {saved && <p className="save-confirmation">Recipes updated</p>}
    </div>
  );
}
