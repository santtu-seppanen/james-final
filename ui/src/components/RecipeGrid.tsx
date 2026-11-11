import type {Bottle, Recipe} from '../types';
import {recipeImage} from '../images';
import {availability, drinkColor, rgbString, STRENGTH_LABEL, strengthHint} from '../drinkColor';
import {Icon} from './Icon';

interface Props {
  recipes: Recipe[];
  bottles: Bottle[];
  onSelect: (r: Recipe) => void;
  onRefill?: () => void;
}

// Menu grid. Pourable drinks first; ones blocked by an empty bottle stay
// visible but disabled with the reason, so a guest knows to ask for a
// refill rather than wondering where the Screwdriver went.
export function RecipeGrid({recipes, bottles, onSelect}: Props) {
  const items = recipes
    .map((recipe) => ({recipe, avail: availability(recipe, bottles)}))
    .sort((a, b) => Number(b.avail.pourable) - Number(a.avail.pourable));

  if (items.length === 0) {
    return (
      <div className="empty-state" role="status">
        <Icon name="glass" size={64} />
        <h2>No drinks on the menu</h2>
        <p>Add recipes in Admin, or load the bottles they need.</p>
      </div>
    );
  }

  if (!items.some((i) => i.avail.pourable)) {
    return (
      <div className="empty-state" role="status">
        <Icon name="bottle" size={64} />
        <h2>Nothing can be poured right now</h2>
        <p>The bottles these drinks need are empty - ask for a refill.</p>
      </div>
    );
  }

  return (
    <div className="recipe-grid">
      {items.map(({recipe, avail}) => {
        const color = rgbString(drinkColor(recipe));
        const chips = recipe.ingredients.slice(0, 3);
        const strength = strengthHint(recipe.ingredients);
        return (
          <button
            key={recipe.name ?? recipe.friendlyname}
            className={`recipe-card${avail.pourable ? '' : ' recipe-card--unavailable'}`}
            onClick={() => onSelect(recipe)}
            disabled={!avail.pourable}
            style={{['--drink' as string]: color}}
            aria-label={
              avail.pourable
                ? `${recipe.friendlyname}, ${STRENGTH_LABEL[strength]}`
                : `${recipe.friendlyname}, unavailable: out of ${avail.missing.join(', ')}`
            }>
            <span className="recipe-card__art" aria-hidden="true">
              <img src={recipeImage(recipe)} alt="" className="recipe-card__image" />
            </span>
            <span className="recipe-card__name">{recipe.friendlyname}</span>
            <span className="recipe-card__chips" aria-hidden="true">
              {chips.map((ing) => (
                <span key={ing.name} className="chip">
                  {ing.name}
                </span>
              ))}
              {recipe.ingredients.length > 3 && <span className="chip chip--more">+{recipe.ingredients.length - 3}</span>}
            </span>
            <span className={`recipe-card__strength strength--${strength}`} aria-hidden="true">
              {avail.pourable ? STRENGTH_LABEL[strength] : `Out of ${avail.missing[0]}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
