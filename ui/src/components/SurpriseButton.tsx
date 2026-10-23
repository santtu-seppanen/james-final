import type {Recipe} from '../types';

export function SurpriseButton({recipes, onPick}: {recipes: Recipe[]; onPick: (recipe: Recipe) => void}) {
  function handleClick() {
    onPick(recipes[Math.floor(Math.random() * recipes.length)]);
  }

  return (
    <div className="ai-generate">
      <button className="button button--ai" onClick={handleClick} disabled={recipes.length === 0}>
        ✨ Surprise me
      </button>
    </div>
  );
}
