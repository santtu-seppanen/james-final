import {useEffect, useState} from 'react';
import type {Recipe} from '../types';
import {drinkColor, rgbString} from '../drinkColor';
import {useProgress} from '../hooks';
import {recipeImage} from '../images';
import {Icon} from './Icon';
import {Keyboard} from './Keyboard';

interface Props {
  recipe: Recipe;
  // AI drinks that aren't on the menu yet get a "Save this drink" step.
  canSave: boolean;
  autoReturnSeconds: number;
  onSave: (name: string) => Promise<void>;
  onHome: () => void;
}

export function DoneScreen({recipe, canSave, autoReturnSeconds, onSave, onHome}: Props) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(recipe.friendlyname);
  const [saveState, setSaveState] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle');
  const manual = recipe.ingredients.filter((i) => i.manual);
  const color = rgbString(drinkColor(recipe));

  // Auto-return pauses while someone is typing a name.
  const countingDown = !saving;
  const progress = useProgress(autoReturnSeconds * 1000, countingDown);

  useEffect(() => {
    if (!countingDown) return;
    const id = window.setTimeout(onHome, autoReturnSeconds * 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countingDown, autoReturnSeconds]);

  async function save() {
    setSaveState('busy');
    try {
      await onSave(name.trim() || recipe.friendlyname);
      setSaveState('saved');
      setSaving(false);
    } catch {
      setSaveState('failed');
    }
  }

  return (
    <div className="done" style={{['--drink' as string]: color}}>
      <div className="done__glow" aria-hidden="true" />

      {!saving ? (
        <>
          <div className="done__main">
            <img src={recipeImage(recipe)} alt="" className="done__art" aria-hidden="true" />
            <div>
              <h1 className="done__title">Enjoy!</h1>
              <p className="done__name">{recipe.friendlyname}</p>
              {(manual.length > 0 || recipe.garnish) && (
                <ul className="done__todo" aria-label="Finish it off">
                  {manual.map((ing) => (
                    <li key={ing.name}>
                      <Icon name="plus" /> Add {ing.serving} ml {ing.name}
                    </li>
                  ))}
                  {recipe.garnish && (
                    <li>
                      <Icon name="glass" /> {recipe.garnish}
                    </li>
                  )}
                </ul>
              )}
              {saveState === 'saved' && (
                <p className="notice notice--ok" role="status">
                  <Icon name="check" /> Saved to the menu as “{name.trim() || recipe.friendlyname}”.
                </p>
              )}
            </div>
          </div>

          <div className="done__actions">
            {canSave && saveState !== 'saved' && (
              <button className="button button--lg button--ghost" onClick={() => setSaving(true)}>
                <Icon name="edit" /> Save this drink
              </button>
            )}
            <button className="button button--primary button--xl" onClick={onHome}>
              <span className="ring" style={{['--p' as string]: progress}} aria-hidden="true" />
              Done
            </button>
          </div>
        </>
      ) : (
        <div className="done__save" role="dialog" aria-label="Save this drink">
          <h2 className="done__save-title">Name your drink</h2>
          <div className="text-field" aria-live="polite">
            <span className="text-field__value">{name || <span className="text-field__placeholder">Type a name</span>}</span>
            <span className="text-field__caret" aria-hidden="true" />
          </div>
          {saveState === 'failed' && (
            <p className="notice notice--error" role="alert">
              <Icon name="warning" /> Couldn't save right now. Try again or skip.
            </p>
          )}
          <Keyboard value={name} onChange={setName} onDone={save} doneLabel={saveState === 'busy' ? 'Saving…' : 'Save'} />
          <div className="done__save-actions">
            <button className="button button--lg" onClick={() => setSaving(false)} disabled={saveState === 'busy'}>
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
