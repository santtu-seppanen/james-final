import type {Bottle} from '../types';

const LOW_FILL_THRESHOLD = 0.2;

export function BottleList({bottles}: {bottles: Bottle[]}) {
  return (
    <ul className="bottle-list">
      {bottles.map((bottle) => {
        const original = bottle.originalCapacity || bottle.capacity;
        const ratio = original > 0 ? bottle.capacity / original : 0;
        const percent = Math.max(0, Math.min(1, ratio)) * 100;
        const isLow = ratio <= LOW_FILL_THRESHOLD;

        return (
          <li className="bottle-row" key={bottle.name}>
            <span className="bottle-row__name">{bottle.name}</span>
            <span className="bottle-row__track">
              <span
                className={`bottle-row__fill${isLow ? ' bottle-row__fill--low' : ''}`}
                style={{width: `${percent}%`}}
              />
            </span>
            <span className="bottle-row__value">{Math.round(bottle.capacity)}ml</span>
          </li>
        );
      })}
    </ul>
  );
}
