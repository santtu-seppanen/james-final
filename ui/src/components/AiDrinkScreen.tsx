import {useState} from 'react';
import type {Recipe} from '../types';
import {drinkColor, rgbString} from '../drinkColor';
import {recipeImage} from '../images';
import {Icon} from './Icon';

interface Props {
  // null while James is still thinking (or after it failed - see `error`).
  recipe: Recipe | null;
  // A guest-readable reason when no drink came back.
  error: string | null;
  onRetry: () => void;
  // Saves the drink to the menu; rejects if that didn't work.
  onAdd: () => Promise<void>;
  onAbandon: () => void;
}

// A drink the AI just invented, on a page of its own: the picture, what goes
// in it and how much. Add to list puts it on the menu (and selects it there),
// Abandon throws it away. Fizzy mixers are always poured by hand.
export function AiDrinkScreen({recipe, error, onRetry, onAdd, onAbandon}: Props) {
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const color = recipe ? drinkColor(recipe) : ([139, 108, 255] as [number, number, number]);
  const total = (recipe ? recipe.ingredients : []).reduce((sum, ing) => sum + Number(ing.serving), 0);

  async function add() {
    if (!recipe) return;
    setSaving(true);
    setFailed(false);
    try {
      await onAdd();
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  return (
    <div
      className="ai-drink"
      style={{['--drink' as string]: rgbString(color), ['--drink-soft' as string]: rgbString(color, 0.22)}}>
      <p className="ai-drink__eyebrow">
        <Icon name="robot" size={22} /> Invented by James
      </p>

      {!recipe ? (
        <>
          <div className="ai-drink__art">
            {error ? (
              <Icon name="warning" size={72} className="modal__icon modal__icon--warn" />
            ) : (
              <div className="spinner spinner--ai" aria-hidden="true" />
            )}
          </div>
          <h1 className="ai-drink__name">{error ? 'No inspiration right now' : 'Mixing up an idea…'}</h1>
          <p className="ai-drink__text" role="status">
            {error || 'James is looking at the bottles and inventing something new.'}
          </p>
          <div className="ai-drink__actions">
            {error && (
              <button className="button button--primary button--lg" onClick={onRetry}>
                <Icon name="refresh" size={24} /> Try again
              </button>
            )}
            <button className="button button--lg button--ghost" onClick={onAbandon}>
              {error ? 'Back to menu' : 'Never mind'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="ai-drink__art">
            <img src={recipeImage(recipe)} alt="" aria-hidden="true" />
          </div>

          <h1 className="ai-drink__name">{recipe.friendlyname}</h1>

          <ul className="ai-drink__ingredients" aria-label="Ingredients">
            {recipe.ingredients.map((ing) => (
              <li key={ing.name}>
                <span className="ai-drink__ingredient-name">
                  {ing.name}
                  {ing.manual && <span className="ai-drink__hand">by hand</span>}
                </span>
                <span className="ai-drink__ml">{ing.serving} ml</span>
              </li>
            ))}
            <li className="ai-drink__total">
              <span>Total</span>
              <span className="ai-drink__ml">{total} ml</span>
            </li>
          </ul>

          {failed && (
            <p className="notice notice--error" role="alert">
              <Icon name="warning" /> Couldn’t save the drink. Try again.
            </p>
          )}

          <div className="ai-drink__actions">
            <button className="button button--primary button--lg" onClick={add} disabled={saving}>
              <Icon name="plus" size={24} /> {saving ? 'Adding…' : 'Add to list'}
            </button>
            <button className="button button--lg button--ghost" onClick={onAbandon} disabled={saving}>
              Abandon
            </button>
          </div>
        </>
      )}
    </div>
  );
}
