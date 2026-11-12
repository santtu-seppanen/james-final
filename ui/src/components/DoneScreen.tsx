import {useEffect} from 'react';
import type {Recipe} from '../types';
import {drinkColor, rgbString} from '../drinkColor';
import {useProgress} from '../hooks';
import {recipeImage} from '../images';
import {Icon} from './Icon';

interface Props {
  recipe: Recipe;
  autoReturnSeconds: number;
  onHome: () => void;
}

export function DoneScreen({recipe, autoReturnSeconds, onHome}: Props) {
  const manual = recipe.ingredients.filter((i) => i.manual);
  const color = rgbString(drinkColor(recipe));
  const progress = useProgress(autoReturnSeconds * 1000, true);

  useEffect(() => {
    const id = window.setTimeout(onHome, autoReturnSeconds * 1000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReturnSeconds]);

  return (
    <div className="done" style={{['--drink' as string]: color}}>
      <div className="done__glow" aria-hidden="true" />

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
        </div>
      </div>

      <div className="done__actions">
        <button className="button button--primary button--xl" onClick={onHome}>
          <span className="ring" style={{['--p' as string]: progress}} aria-hidden="true" />
          Done
        </button>
      </div>
    </div>
  );
}
