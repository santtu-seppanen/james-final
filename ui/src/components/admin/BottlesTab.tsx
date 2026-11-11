import {useEffect, useState} from 'react';
import type {Bottle} from '../../types';
import {bottleImages, fallbackBottleImage} from '../../images';
import {getAvailableBottleNames, getBottles, pourAdHoc, setBottles} from '../../api';
import {bottleLevel} from '../../drinkColor';
import {features} from '../../features';
import {Icon} from '../Icon';

const CAPACITIES = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
const SERVINGS = [25, 50];

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed';

// Slot, name, capacity, pour size, "Refilled" and a test shot per bottle.
// Edits are local until Save; the whole array goes to /setBottles, same
// as before. "Refilled" = capacity back to its original (the old admin
// screen did this implicitly whenever capacity was changed).
export function BottlesTab() {
  const [bottles, setLocalBottles] = useState<Bottle[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [state, setState] = useState<SaveState>('idle');
  const [priming, setPriming] = useState<number | null>(null);

  useEffect(() => {
    getBottles().then(setLocalBottles);
    getAvailableBottleNames().then(setNames);
  }, []);

  function update(index: number, patch: Partial<Bottle>) {
    setLocalBottles((prev) => prev.map((b, i) => (i === index ? {...b, ...patch} : b)));
    setState('dirty');
  }

  async function save() {
    setState('saving');
    try {
      const updated = await setBottles(bottles);
      setLocalBottles(updated);
      setState('saved');
      window.setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 2500);
    } catch {
      setState('failed');
    }
  }

  // Prime: one pour into a waste glass. There's no dedicated endpoint
  // (issue #10), so this goes through /drinkme as a one-ingredient ad-hoc
  // recipe - it counts as a serving and reduces the level by one shot.
  async function prime(index: number) {
    const bottle = bottles[index];
    setPriming(index);
    try {
      await pourAdHoc({friendlyname: `Prime ${bottle.name}`, ingredients: [{name: bottle.name, serving: Number(bottle.serving)}]});
    } finally {
      window.setTimeout(() => setPriming(null), 8000);
    }
  }

  const selectable = (current: string) => (names.includes(current) ? names : [current, ...names]);

  return (
    <div className="admin-tab">
      <div className="admin-tab__head">
        <h2>Bottles</h2>
        <div className="admin-tab__head-actions">
          <SaveStatus state={state} />
          <button className="button button--primary button--lg" onClick={save} disabled={state !== 'dirty' && state !== 'failed'}>
            Save
          </button>
        </div>
      </div>

      <div className="slot-grid">
        {bottles.map((bottle, index) => {
          const level = bottleLevel(bottle);
          return (
            <div key={index} className={`slot-card${level.isSlotUnused ? ' slot-card--unused' : ''}`}>
              <div className="slot-card__head">
                <span className="slot-card__slot">Slot {index + 1}</span>
                <img src={bottleImages[bottle.name] || fallbackBottleImage} alt="" />
              </div>

              <label className="field">
                Bottle
                <select value={bottle.name} onChange={(e) => update(index, {name: e.target.value})}>
                  {selectable(bottle.name).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                Capacity
                <select
                  value={Number(bottle.capacity)}
                  onChange={(e) => {
                    const capacity = Number(e.target.value);
                    update(index, {capacity, originalCapacity: capacity});
                  }}>
                  {!CAPACITIES.includes(Number(bottle.capacity)) && (
                    <option value={Number(bottle.capacity)}>{Number(bottle.capacity)} ml</option>
                  )}
                  {CAPACITIES.map((c) => (
                    <option key={c} value={c}>
                      {c} ml
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                Pour size
                <select value={Number(bottle.serving)} onChange={(e) => update(index, {serving: Number(e.target.value)})}>
                  {SERVINGS.map((s) => (
                    <option key={s} value={s}>
                      {s} ml
                    </option>
                  ))}
                </select>
              </label>

              <div className="slot-card__level">
                <span className="slot-card__bar" aria-hidden="true">
                  <span style={{width: `${Math.round(level.ratio * 100)}%`}} className={level.isLow ? 'is-low' : ''} />
                </span>
                <span>
                  {Math.round(Number(bottle.capacity))} / {Math.round(Number(bottle.originalCapacity || bottle.capacity))} ml
                </span>
              </div>

              <div className="slot-card__actions">
                <button
                  className="button"
                  onClick={() => update(index, {capacity: Number(bottle.originalCapacity || bottle.capacity)})}
                  disabled={level.isSlotUnused}>
                  <Icon name="refresh" size={20} /> Refilled
                </button>
                {features.maintenance ? (
                  <button className="button" disabled={level.isSlotUnused || priming !== null} onClick={() => prime(index)}>
                    <Icon name="glass" size={20} /> Prime
                  </button>
                ) : (
                  <button
                    className="button"
                    disabled={level.isSlotUnused || level.isEmpty || priming !== null}
                    onClick={() => prime(index)}
                    title="One shot via /drinkme - counts as a serving">
                    <Icon name="glass" size={20} /> {priming === index ? 'Pouring…' : 'Test shot'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SaveStatus({state}: {state: SaveState}) {
  if (state === 'saving') return <span className="save-status">Saving…</span>;
  if (state === 'saved')
    return (
      <span className="save-status save-status--ok">
        <Icon name="check" size={18} /> Saved
      </span>
    );
  if (state === 'failed')
    return (
      <span className="save-status save-status--error" role="alert">
        <Icon name="warning" size={18} /> Couldn't save - try again
      </span>
    );
  if (state === 'dirty') return <span className="save-status">Unsaved changes</span>;
  return null;
}

export type {SaveState};
