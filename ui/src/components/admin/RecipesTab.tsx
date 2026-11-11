import {useEffect, useState} from 'react';
import type {Ingredient, Recipe} from '../../types';
import {drinkImages, fallbackDrinkImage} from '../../images';
import {getAvailableBottleNames, getRecipes, setRecipes} from '../../api';
import {drinkColor, rgbString, toHex} from '../../drinkColor';
import {Icon} from '../Icon';
import {Keyboard} from '../Keyboard';
import {SaveStatus, type SaveState} from './BottlesTab';

const IMAGE_CHOICES = Object.keys(drinkImages);
const SERVING_SIZES = Array.from({length: 15}, (_, i) => (i + 1) * 10);
const GARNISHES = ['', 'lime wedge', 'lemon wedge', 'orange slice', 'mint sprig', 'sugar rim', 'salt rim', 'straw', 'cherry'];
const COLORS = ['', '#1b95e0', '#6a2c91', '#dc1e46', '#ff9614', '#78dc3c', '#ff5aa0', '#f0dc96', '#c86e1e'];

function emptyRecipe(): Recipe {
  return {friendlyname: '', ingredients: [], imageUrl: IMAGE_CHOICES[0]};
}

// Edit / add recipes, plus garnish and colour (issue #7, #2). Saves the
// whole list via /setRecipes like the old RecipeAdmin did.
export function RecipesTab() {
  const [recipes, setLocalRecipes] = useState<Recipe[]>([]);
  const [bottleNames, setBottleNames] = useState<string[]>([]);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [typing, setTyping] = useState(false);
  const [state, setState] = useState<SaveState>('idle');

  useEffect(() => {
    getRecipes().then(setLocalRecipes);
    getAvailableBottleNames().then(setBottleNames);
  }, []);

  function updateIngredient(index: number, patch: Partial<Ingredient>) {
    if (!editing) return;
    setEditing({...editing, ingredients: editing.ingredients.map((ing, i) => (i === index ? {...ing, ...patch} : ing))});
  }

  function addIngredient() {
    if (!editing) return;
    setEditing({...editing, ingredients: [...editing.ingredients, {name: bottleNames[0] || '', serving: 10}]});
  }

  function removeIngredient(index: number) {
    if (!editing) return;
    setEditing({...editing, ingredients: editing.ingredients.filter((_, i) => i !== index)});
  }

  async function persist(next: Recipe[]) {
    setState('saving');
    try {
      const updated = await setRecipes(next);
      setLocalRecipes(updated);
      setEditing(null);
      setState('saved');
      window.setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 2500);
    } catch {
      setState('failed');
    }
  }

  function saveEditing() {
    if (!editing || !editing.friendlyname.trim() || editing.ingredients.length === 0) return;
    const isNew = !editing.name;
    const withName: Recipe = isNew ? {...editing, name: String(Date.now())} : editing;
    persist(isNew ? [...recipes, withName] : recipes.map((r) => (r.name === withName.name ? withName : r)));
  }

  function remove() {
    if (!editing || !editing.name) return;
    persist(recipes.filter((r) => r.name !== editing.name));
  }

  if (editing) {
    const canSave = !!editing.friendlyname.trim() && editing.ingredients.length > 0;
    const previewColor = rgbString(drinkColor(editing));
    return (
      <div className="admin-tab">
        <div className="admin-tab__head">
          <h2>{editing.name ? 'Edit recipe' : 'New recipe'}</h2>
          <div className="admin-tab__head-actions">
            <SaveStatus state={state} />
            {editing.name && (
              <button className="button button--danger-ghost" onClick={remove}>
                Delete
              </button>
            )}
            <button className="button button--lg" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="button button--primary button--lg" onClick={saveEditing} disabled={!canSave || state === 'saving'}>
              Save
            </button>
          </div>
        </div>

        <div className="recipe-form">
          <div className="recipe-form__col">
            <label className="field">
              Name
              <button
                type="button"
                className={`text-field text-field--button${typing ? ' is-active' : ''}`}
                onClick={() => setTyping((t) => !t)}
                aria-expanded={typing}>
                <span className="text-field__value">
                  {editing.friendlyname || <span className="text-field__placeholder">Tap to type</span>}
                </span>
                <Icon name="edit" size={20} />
              </button>
            </label>
            {typing && (
              <Keyboard
                value={editing.friendlyname}
                onChange={(friendlyname) => setEditing({...editing, friendlyname})}
                onDone={() => setTyping(false)}
              />
            )}

            <label className="field">
              Image
              <select value={editing.imageUrl} onChange={(e) => setEditing({...editing, imageUrl: e.target.value})}>
                {IMAGE_CHOICES.map((img) => (
                  <option key={img} value={img}>
                    {img}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              Garnish
              <select value={editing.garnish || ''} onChange={(e) => setEditing({...editing, garnish: e.target.value || undefined})}>
                {GARNISHES.map((g) => (
                  <option key={g} value={g}>
                    {g || 'none'}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              Colour
              <span className="swatches" role="radiogroup" aria-label="Drink colour">
                {COLORS.map((c) => (
                  <button
                    key={c || 'auto'}
                    type="button"
                    role="radio"
                    aria-checked={(editing.color || '') === c}
                    aria-label={c ? c : 'Automatic from ingredients'}
                    className={`swatch${(editing.color || '') === c ? ' is-selected' : ''}`}
                    style={{background: c || previewColor}}
                    onClick={() => setEditing({...editing, color: c || undefined})}>
                    {!c && 'auto'}
                  </button>
                ))}
              </span>
              <span className="field__hint">Auto = {toHex(drinkColor({...editing, color: undefined}))}, used for lights and the pouring screen.</span>
            </label>
          </div>

          <div className="recipe-form__col">
            <div className="recipe-form__preview" style={{['--drink' as string]: previewColor}}>
              <img src={(editing.imageUrl && drinkImages[editing.imageUrl]) || fallbackDrinkImage} alt="" />
            </div>
            <h3>Ingredients</h3>
            {editing.ingredients.length === 0 && <p className="field__hint">Add at least one ingredient.</p>}
            {editing.ingredients.map((ing, index) => (
              <div key={index} className="ingredient-row">
                <select value={ing.name} onChange={(e) => updateIngredient(index, {name: e.target.value})} aria-label="Ingredient">
                  {(bottleNames.includes(ing.name) ? bottleNames : [ing.name, ...bottleNames]).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <select value={ing.serving} onChange={(e) => updateIngredient(index, {serving: Number(e.target.value)})} aria-label="Amount">
                  {!SERVING_SIZES.includes(Number(ing.serving)) && <option value={ing.serving}>{ing.serving} ml</option>}
                  {SERVING_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s} ml
                    </option>
                  ))}
                </select>
                <label className="checkbox-field">
                  <input type="checkbox" checked={!!ing.manual} onChange={(e) => updateIngredient(index, {manual: e.target.checked})} />
                  by hand
                </label>
                <button className="button button--icon" onClick={() => removeIngredient(index)} aria-label={`Remove ${ing.name}`}>
                  <Icon name="minus" />
                </button>
              </div>
            ))}
            <button className="button" onClick={addIngredient}>
              <Icon name="plus" size={20} /> Add ingredient
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-tab">
      <div className="admin-tab__head">
        <h2>Recipes</h2>
        <div className="admin-tab__head-actions">
          <SaveStatus state={state} />
          <button className="button button--primary button--lg" onClick={() => setEditing(emptyRecipe())}>
            <Icon name="plus" /> New recipe
          </button>
        </div>
      </div>
      <div className="admin-recipes">
        {recipes.map((recipe) => (
          <button key={recipe.name} className="admin-recipe" onClick={() => setEditing(recipe)} style={{['--drink' as string]: rgbString(drinkColor(recipe))}}>
            <img src={(recipe.imageUrl && drinkImages[recipe.imageUrl]) || fallbackDrinkImage} alt="" />
            <span className="admin-recipe__name">{recipe.friendlyname}</span>
            <span className="admin-recipe__ings">{recipe.ingredients.map((i) => `${i.name} ${i.serving}`).join(', ')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
