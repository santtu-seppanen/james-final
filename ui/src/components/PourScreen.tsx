import {useEffect, useRef, useState} from 'react';
import type {Bottle, Recipe} from '../types';
import {drinkImages, fallbackDrinkImage} from '../images';
import {pourByName} from '../api';

interface Props {
  recipe: Recipe;
  bottles: Bottle[];
  servos: boolean[];
  onCancel: () => void;
  onPoured: (recipe: Recipe) => void;
}

export function PourScreen({recipe, bottles, servos, onCancel, onPoured}: Props) {
  const [serving, setServing] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState('');
  const intervalRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(intervalRef.current), []);

  const lowBottles = bottles
    .filter((bottle) =>
      recipe.ingredients.some(
        (ing) => ing.name.toUpperCase() === bottle.name.toUpperCase() && bottle.capacity < ing.serving,
      ),
    )
    .map((b) => b.name);

  async function serve() {
    setError('');
    try {
      const result = await pourByName(recipe.name || recipe.friendlyname);

      if (!result.success) {
        setError(result.error || 'Pouring failed');
        return;
      }

      const totalSeconds = Math.round(result.pourTime / 1000);
      setServing(true);
      setSecondsLeft(totalSeconds);

      intervalRef.current = window.setInterval(() => {
        setSecondsLeft((s) => Math.max(0, s - 1));
      }, 1000);

      window.setTimeout(() => {
        window.clearInterval(intervalRef.current);
        onPoured(recipe);
      }, result.pourTime);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pouring failed');
    }
  }

  return (
    <div className="pour-screen">
      {lowBottles.length > 0 && (
        <p className="low-bottle-warning">{lowBottles.join(', ')} running low!</p>
      )}

      <div className="pour-screen__header">
        <img
          src={(recipe.imageUrl && drinkImages[recipe.imageUrl]) || fallbackDrinkImage}
          alt=""
          className="pour-screen__image"
        />
        <div>
          <h2>{recipe.friendlyname.toUpperCase()}</h2>
          <p className="pour-screen__ingredients-label">Ingredients:</p>
          <ul className="pour-screen__ingredients">
            {recipe.ingredients.map((ing) => (
              <li key={ing.name}>
                <span>{ing.name}</span>
                <span>{ing.serving} ml</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {error && <p className="pour-screen__error">{error}</p>}

      {!serving ? (
        <div className="pour-screen__actions">
          <button className="button button--primary" onClick={serve}>
            Serve it!
          </button>
          <button className="button" onClick={onCancel}>
            Back
          </button>
        </div>
      ) : (
        <div className="pour-screen__serving">
          <div className="pour-screen__bottles">
            {bottles.map((bottle, i) => (
              <div key={bottle.name} className="pour-screen__bottle-status">
                <span>{bottle.capacity}ml</span>
                <span className={`servo-indicator${servos[i] ? ' servo-indicator--active' : ''}`} />
                <span>{bottle.name}</span>
              </div>
            ))}
          </div>
          <p className="pour-screen__countdown">Serving {secondsLeft}</p>
        </div>
      )}
    </div>
  );
}
