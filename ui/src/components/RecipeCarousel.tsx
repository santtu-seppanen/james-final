import {useRef} from 'react';
import type {Bottle, Recipe} from '../types';
import {recipeImage} from '../images';
import {drinkColor, rgbString, STRENGTH_LABEL, strengthHint} from '../drinkColor';
import {Icon} from './Icon';

interface Props {
  // Only drinks that can be poured right now; the caller filters.
  recipes: Recipe[];
  bottles: Bottle[];
  onSelect: (r: Recipe) => void;
}

// The menu: one row of big cards that swipes (scroll-snap) and has arrow
// buttons for guests who don't think to swipe.
export function RecipeCarousel({recipes, onSelect}: Props) {
  const track = useRef<HTMLDivElement>(null);

  if (recipes.length === 0) {
    return (
      <div className="empty-state" role="status">
        <Icon name="bottle" size={64} />
        <h2>Nothing can be poured right now</h2>
        <p>The bottles these drinks need are empty - ask for a refill.</p>
      </div>
    );
  }

  function scrollBy(direction: -1 | 1) {
    const el = track.current;
    if (!el) return;
    el.scrollBy({left: direction * el.clientWidth * 0.8, behavior: 'smooth'});
  }

  return (
    <div className="carousel">
      <button className="carousel__arrow carousel__arrow--prev" onClick={() => scrollBy(-1)} aria-label="Previous drinks">
        <Icon name="back" size={36} />
      </button>

      <div className="carousel__track" ref={track}>
        {recipes.map((recipe) => {
          const strength = strengthHint(recipe.ingredients);
          const chips = recipe.ingredients.slice(0, 3);
          return (
            <button
              key={recipe.name ?? recipe.friendlyname}
              className="carousel__card"
              onClick={() => onSelect(recipe)}
              style={{['--drink' as string]: rgbString(drinkColor(recipe))}}
              aria-label={`${recipe.friendlyname}, ${STRENGTH_LABEL[strength]}`}>
              <span className="carousel__art" aria-hidden="true">
                <img src={recipeImage(recipe)} alt="" />
              </span>
              <span className="carousel__name">{recipe.friendlyname}</span>
              <span className="recipe-card__chips" aria-hidden="true">
                {chips.map((ing) => (
                  <span key={ing.name} className="chip">
                    {ing.name}
                  </span>
                ))}
                {recipe.ingredients.length > 3 && <span className="chip chip--more">+{recipe.ingredients.length - 3}</span>}
              </span>
              <span className={`recipe-card__strength strength--${strength}`} aria-hidden="true">
                {STRENGTH_LABEL[strength]}
              </span>
            </button>
          );
        })}
      </div>

      <button className="carousel__arrow carousel__arrow--next" onClick={() => scrollBy(1)} aria-label="Next drinks">
        <Icon name="back" size={36} className="carousel__flip" />
      </button>
    </div>
  );
}
