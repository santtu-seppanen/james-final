import type {Bottle} from '../types';
import {bottleLevel, ingredientColor, rgbString} from '../drinkColor';
import {Icon} from './Icon';

interface Props {
  bottles: Bottle[];
  // Which slot is pouring right now (from the servoState socket event).
  active?: boolean[];
  // Tint active slots with the drink's colour on the pouring screen.
  activeColor?: string;
  layout?: 'vertical' | 'horizontal';
}

// Six (eight, by config) bottles in the same order as the physical slots:
// bottles[i] is the bottle on servo slot i. Fill level as a vertical bar,
// low (<20 %) in the warning colour with a text label too, unused /
// empty slots greyed out, so colour is never the only signal.
export function BottleStrip({bottles, active, activeColor, layout = 'vertical'}: Props) {
  return (
    <ul className={`bottle-strip bottle-strip--${layout}`} aria-label="Bottle levels">
      {bottles.map((bottle, i) => {
        const level = bottleLevel(bottle);
        const isActive = !!(active && active[i]);
        const tint = ingredientColor(bottle.name);
        const fillColor = isActive && activeColor ? activeColor : tint ? rgbString(tint) : undefined;
        const state = level.isSlotUnused ? 'unused' : level.isEmpty ? 'empty' : level.isLow ? 'low' : 'ok';
        const label = level.isSlotUnused
          ? `Slot ${i + 1}: empty slot`
          : `Slot ${i + 1}: ${bottle.name}, ${Math.round(level.ratio * 100)} % left${level.isLow ? ', running low' : ''}${level.isEmpty ? ', empty' : ''}`;

        return (
          <li
            key={`${i}-${bottle.name}`}
            className={`bottle-slot bottle-slot--${state}${isActive ? ' bottle-slot--active' : ''}`}
            aria-label={label}
            style={isActive && activeColor ? {['--glow' as string]: activeColor} : undefined}>
            <span className="bottle-slot__gauge" aria-hidden="true">
              <span
                className="bottle-slot__fill"
                style={{height: `${Math.round(level.ratio * 100)}%`, background: fillColor}}
              />
            </span>
            <span className="bottle-slot__name">{level.isSlotUnused ? '—' : bottle.name}</span>
            <span className="bottle-slot__meta">
              {level.isSlotUnused ? 'empty slot' : level.isEmpty ? 'empty' : `${Math.round(Number(bottle.capacity))} ml`}
              {level.isLow && (
                <span className="bottle-slot__warn">
                  <Icon name="warning" size={14} /> low
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
