import type {Recipe} from '../types';
import {drinkImages, fallbackDrinkImage} from '../images';

export function RecipeGrid({recipes, onSelect}: {recipes: Recipe[]; onSelect: (r: Recipe) => void}) {
  if (recipes.length === 0) {
    return <p className="empty-state">No recipes available with the bottles currently loaded.</p>;
  }

  return (
    <div className="recipe-grid">
      {recipes.map((recipe) => (
        <button
          key={recipe.name ?? recipe.friendlyname}
          className="recipe-card"
          onClick={() => onSelect(recipe)}>
          <img
            src={(recipe.imageUrl && drinkImages[recipe.imageUrl]) || fallbackDrinkImage}
            alt=""
            className="recipe-card__image"
          />
          <span className="recipe-card__name">{recipe.friendlyname}</span>
        </button>
      ))}
    </div>
  );
}
