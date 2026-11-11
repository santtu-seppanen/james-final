import {useState} from 'react';
import type {Bottle, PourResult, Recipe, Strength} from '../types';
import {pourAdHoc, pourByName} from '../api';
import {availability, drinkColor, rgbString, STRENGTH_LABEL, strengthHint} from '../drinkColor';
import {features} from '../features';
import {recipeImage} from '../images';
import {Icon} from './Icon';

interface Props {
  recipe: Recipe;
  bottles: Bottle[];
  isAiDrink: boolean;
  onBack: () => void;
  onStarted: (result: PourResult, show: boolean) => void;
}

const STRENGTHS: Strength[] = ['mocktail', 'light', 'regular', 'strong'];

// Drink detail + the one decision: serve it or go back. Sends /drinkme
// and hands the result (pour time) up to App, which switches to Pouring.
export function ConfirmScreen({recipe, bottles, isAiDrink, onBack, onStarted}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [strength, setStrength] = useState<Strength>('regular');

  const avail = availability(recipe, bottles);
  const color = rgbString(drinkColor(recipe));
  const hint = strengthHint(recipe.ingredients);

  async function serve(show: boolean) {
    setBusy(true);
    setError('');
    try {
      const result = isAiDrink
        ? await pourAdHoc(recipe, show)
        : await pourByName(recipe.name || recipe.friendlyname, show);
      if (!result.success) {
        setError(humanPourError(result.error));
        setBusy(false);
        return;
      }
      onStarted(result, show);
    } catch (e) {
      setError(humanPourError(e instanceof Error ? e.message : ''));
      setBusy(false);
    }
  }

  return (
    <div className="confirm" style={{['--drink' as string]: color}}>
      <button className="back-button" onClick={onBack} aria-label="Back to menu">
        <Icon name="back" size={32} /> Menu
      </button>

      <div className="confirm__body">
        <div className="confirm__art" aria-hidden="true">
          <img src={recipeImage(recipe)} alt="" />
        </div>

        <div className="confirm__info">
          {isAiDrink && (
            <span className="badge badge--ai">
              <Icon name="robot" size={18} /> AI invention
            </span>
          )}
          <h1 className="confirm__name">{recipe.friendlyname}</h1>
          <p className="confirm__hint">{STRENGTH_LABEL[hint]}</p>

          <ul className="confirm__ingredients">
            {recipe.ingredients.map((ing) => {
              const isMissing = avail.missing.includes(ing.name);
              const isLow = avail.low.includes(ing.name);
              return (
                <li key={ing.name} className={isMissing ? 'is-missing' : ''}>
                  <span className="confirm__ingredient-name">
                    {ing.name}
                    {ing.manual && <span className="chip chip--manual">add by hand</span>}
                  </span>
                  <span className="confirm__ingredient-ml">
                    {isLow && <Icon name="warning" size={18} className="text-warn" />}
                    {ing.serving} ml
                  </span>
                </li>
              );
            })}
          </ul>
          {recipe.garnish && (
            <p className="confirm__garnish">
              <Icon name="glass" size={20} /> Garnish: {recipe.garnish}
            </p>
          )}

          {features.strength && (
            <div className="segmented" role="radiogroup" aria-label="Strength">
              {STRENGTHS.map((s) => (
                <button
                  key={s}
                  role="radio"
                  aria-checked={strength === s}
                  className={`segmented__option${strength === s ? ' is-selected' : ''}`}
                  onClick={() => setStrength(s)}>
                  {STRENGTH_LABEL[s]}
                </button>
              ))}
            </div>
          )}

          {avail.missing.length > 0 && (
            <p className="notice notice--error" role="alert">
              <Icon name="warning" /> Out of {avail.missing.join(' and ')} - ask for a refill.
            </p>
          )}
          {avail.missing.length === 0 && avail.low.length > 0 && (
            <p className="notice notice--warn" role="status">
              <Icon name="warning" /> {avail.low.join(' and ')} running low - might be a short pour.
            </p>
          )}
          {error && (
            <p className="notice notice--error" role="alert">
              <Icon name="warning" /> {error}
            </p>
          )}
        </div>
      </div>

      <div className="confirm__actions">
        <button
          className="button button--primary button--xl button--serve"
          onClick={() => serve(false)}
          disabled={busy || !avail.pourable}>
          <Icon name="glass" size={32} /> {busy ? 'Starting…' : 'Serve it!'}
        </button>
        {features.show && (
          <button className="button button--xl button--ghost" onClick={() => serve(true)} disabled={busy || !avail.pourable}>
            <Icon name="music" size={28} /> Serve with show
          </button>
        )}
      </div>
    </div>
  );
}

function humanPourError(message?: string): string {
  if (!message) return 'James couldn’t start pouring. Try again.';
  const m = message.toLowerCase();
  if (m.includes('not enough left')) return 'A bottle ran dry - ask for a refill and try again.';
  if (m.includes('unknown bottle')) return 'One of the ingredients isn’t loaded any more. Pick another drink.';
  if (m.includes('fetch') || m.includes('network')) return 'Lost the connection to the bar. Try again in a moment.';
  if (m.includes('multiple of')) return 'This recipe doesn’t match the bottle pour sizes. Ask an admin to fix it.';
  return message.length < 80 ? message : 'James couldn’t start pouring. Try again.';
}
