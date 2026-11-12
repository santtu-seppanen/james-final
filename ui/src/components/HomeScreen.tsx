import {useEffect, useRef, useState} from 'react';
import type {Bottle, Recipe} from '../types';
import {availability} from '../drinkColor';
import {SHOT_COUNT, shotRecipes} from '../shots';
import {RecipeCarousel} from './RecipeCarousel';
import {Icon} from './Icon';

interface Props {
  bottles: Bottle[];
  recipes: Recipe[];
  // Menu id of a drink the ring should open on (one just added from the AI page).
  focusDrink: string | null;
  // The AI drink was poured: App opens its page right away and fills it in when James is done.
  onInvent: () => void;
  // "5 viinaa": shot glasses instead of one glass, one bottle at a time.
  shotMode: boolean;
  onShotMode: (on: boolean) => void;
  // Starts the pour flow (which first asks for the glass).
  onPour: (recipe: Recipe) => void;
}

// The AI bartender is one more stop on the ring: pour it and James invents a drink.
const AI_ITEM: Recipe = {
  name: 'ai:new',
  friendlyname: 'AI drink',
  ingredients: [],
  imageUrl: 'ai',
  color: '#8b6cff',
  subtitle: 'Let James invent one',
};

const SPIN_MS = 4000; // the ring turns by itself ...
const PAUSE_MS = 12000; // ... except for this long after someone touches it

export function HomeScreen({bottles, recipes, focusDrink, onInvent, shotMode, onShotMode, onPour}: Props) {
  const [index, setIndex] = useState(() =>
    Math.max(0, recipes.filter((r) => availability(r, bottles).pourable).findIndex((r) => r.name === focusDrink)),
  );
  const lastTouch = useRef(0);

  const pourable = shotMode ? shotRecipes(bottles) : recipes.filter((r) => availability(r, bottles).pourable);
  // Needs two loaded bottles to have anything to work with.
  const aiPossible = !shotMode && bottles.filter((b) => b.name !== 'empty' && Number(b.capacity) > 0).length >= 2;
  const items = aiPossible ? [...pourable, AI_ITEM] : pourable;
  const front = items.length > 0 ? ((index % items.length) + items.length) % items.length : 0;

  const touch = () => {
    lastTouch.current = Date.now();
  };

  useEffect(() => {
    if (items.length < 2) return;
    const id = window.setInterval(() => {
      if (Date.now() - lastTouch.current > PAUSE_MS) setIndex((i) => i + 1);
    }, SPIN_MS);
    return () => window.clearInterval(id);
  }, [items.length]);

  function surprise() {
    if (pourable.length === 0) return;
    touch();
    const pick = pourable[Math.floor(Math.random() * pourable.length)];
    setIndex(items.indexOf(pick));
  }

  function pour() {
    const recipe = items[front];
    if (recipe === AI_ITEM) onInvent();
    else if (recipe) onPour(recipe);
  }

  return (
    <div className="home" onPointerDown={touch}>
      <div className="home__top">
        <button
          className="pill pill--surprise"
          onClick={surprise}
          disabled={pourable.length === 0}
          aria-label="Surprise me: turn the ring to a random choice">
          <Icon name="sparkles" size={22} /> Surprise me
        </button>
        <button
          className={`pill pill--shot${shotMode ? ' pill--on' : ''}`}
          role="switch"
          aria-checked={shotMode}
          onClick={() => {
            touch();
            setIndex(0);
            onShotMode(!shotMode);
          }}>
          <span className="pill__glasses" aria-hidden="true">
            {Array.from({length: SHOT_COUNT}, (_, i) => (
              <span key={i} className="pill__glass" style={{transitionDelay: `${i * 40}ms`}} />
            ))}
          </span>
          Shot mode
        </button>
      </div>

      <RecipeCarousel recipes={items} index={front} onIndex={(i) => (touch(), setIndex(i))} />

      <div className="home__pour">
        <button className="button button--primary button--xl pour-button" onClick={pour} disabled={items.length === 0}>
          {items[front] === AI_ITEM ? 'Invent a drink' : 'Pour the drink'}
        </button>
      </div>
    </div>
  );
}
