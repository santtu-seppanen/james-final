import {useEffect, useState} from 'react';
import type {Bottle} from '../types';
import {bottleImages, fallbackBottleImage} from '../images';
import {getBottles, setBottles} from '../api';
import {PinPad} from './PinPad';

const CAPACITIES = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
const SERVINGS = [25, 50];

export function BottleAdmin({onBack}: {onBack: () => void}) {
  const [authorised, setAuthorised] = useState(false);
  const [bottles, setLocalBottles] = useState<Bottle[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (authorised) getBottles().then(setLocalBottles);
  }, [authorised]);

  function updateBottle(index: number, patch: Partial<Bottle>) {
    setLocalBottles((prev) => prev.map((b, i) => (i === index ? {...b, ...patch} : b)));
  }

  async function save() {
    const updated = await setBottles(bottles);
    setLocalBottles(updated);
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

  return (
    <div className="screen">
      <h2>Bottles</h2>
      <div className="bottle-admin-grid">
        {bottles.map((bottle, index) => (
          <div key={bottle.name} className="bottle-admin-card">
            <img src={bottleImages[bottle.name] || fallbackBottleImage} alt="" />
            <span className="bottle-admin-card__name">{bottle.name}</span>
            <label>
              Capacity
              <select
                value={bottle.capacity}
                onChange={(e) => {
                  // Changing capacity here means "I refilled/reconfigured
                  // this bottle" - reset originalCapacity too so the fill
                  // gauge reads 100% again, matching the old admin screen.
                  const capacity = Number(e.target.value);
                  updateBottle(index, {capacity, originalCapacity: capacity});
                }}>
                {CAPACITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}ml
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pour size
              <select
                value={bottle.serving}
                onChange={(e) => updateBottle(index, {serving: Number(e.target.value)})}>
                {SERVINGS.map((s) => (
                  <option key={s} value={s}>
                    {s}ml
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>
      <div className="screen__actions">
        <button className="button button--primary" onClick={save}>
          Save
        </button>
        <button className="button" onClick={onBack}>
          Back
        </button>
      </div>
      {saved && <p className="save-confirmation">Bottles updated</p>}
    </div>
  );
}
