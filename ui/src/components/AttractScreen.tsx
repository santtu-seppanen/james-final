import type {Bottle, Recipe} from '../types';
import {availability, drinkColor, rgbString} from '../drinkColor';
import {useRotation} from '../hooks';
import {recipeImage} from '../images';
import {tonightStart, topDrinks} from '../stats';
import {Icon} from './Icon';

interface Props {
  recipes: Recipe[];
  bottles: Bottle[];
  onWake: () => void;
}

// Idle screen after a minute without touches: slow drift, a featured
// drink rotating through the menu, and tonight's top 5 when this kiosk
// has poured anything. Any tap wakes it up.
export function AttractScreen({recipes, bottles, onWake}: Props) {
  const menu = recipes.filter((r) => availability(r, bottles).pourable);
  const index = useRotation(menu.length, 6000, true);
  const featured = menu[index];
  const top = topDrinks(tonightStart());

  return (
    <button className="attract" onClick={onWake} aria-label="Tap anywhere to start">
      <div className="attract__drift" aria-hidden="true" />

      <div className="attract__brand">
        <span className="attract__logo">James</span>
        <span className="attract__tagline">your cocktail robot</span>
      </div>

      <div className="attract__body">
        {featured ? (
          <div
            className="attract__featured"
            key={featured.name ?? featured.friendlyname}
            style={{['--drink' as string]: rgbString(drinkColor(featured))}}>
            <img src={recipeImage(featured)} alt="" aria-hidden="true" />
            <div>
              <p className="attract__eyebrow">On the menu</p>
              <p className="attract__featured-name">{featured.friendlyname}</p>
              <p className="attract__featured-ings">{featured.ingredients.map((i) => i.name).join(' · ')}</p>
            </div>
          </div>
        ) : (
          <div className="attract__featured">
            <Icon name="bottle" size={64} />
            <div>
              <p className="attract__featured-name">Bar's closed for a refill</p>
              <p className="attract__featured-ings">Nothing can be poured with the current bottles.</p>
            </div>
          </div>
        )}

        {top.length > 0 && (
          <ol className="attract__top" aria-label="Top drinks tonight">
            <li className="attract__top-title">Top {Math.min(5, top.length)} tonight</li>
            {top.map((t, i) => (
              <li key={t.friendlyname}>
                <span className="attract__rank">{i + 1}</span>
                <span className="attract__top-name">{t.friendlyname}</span>
                <span className="attract__top-count">×{t.count}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <p className="attract__cta">Tap anywhere to pour a drink</p>
    </button>
  );
}
