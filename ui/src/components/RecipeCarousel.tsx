import {useLayoutEffect, useRef, useState} from 'react';
import type {Bottle, Recipe} from '../types';
import {recipeImage} from '../images';
import {drinkColor, rgbString} from '../drinkColor';
import {Icon} from './Icon';

interface Props {
  // Only drinks that can be poured right now; the caller filters.
  recipes: Recipe[];
  bottles: Bottle[];
  onSelect: (r: Recipe) => void;
}

// A ring of cards seen at an angle: the drink in front is big and bright,
// the rest curve away behind it, smaller and dimmer. Swipe or use the
// arrows to turn the ring; tapping a card behind brings it to the front,
// tapping the front card picks the drink.
const MIN_SLOTS = 9; // keep the ring looking like a ring with only a few drinks
const SWIPE_PX = 40;

export function RecipeCarousel({recipes, onSelect}: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({w: 0, h: 0});
  const [rawIndex, setIndex] = useState(0);
  const dragStartX = useRef<number | null>(null);
  const justSwiped = useRef(false);
  const count = recipes.length;
  const hasCards = count > 0;
  // The menu changes under us (a bottle runs dry, an AI drink is added).
  const index = count > 0 ? rawIndex % count : 0;

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setSize({w: el.clientWidth, h: el.clientHeight});
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasCards]);

  if (count === 0) {
    return (
      <div className="empty-state" role="status">
        <Icon name="bottle" size={64} />
        <h2>Nothing can be poured right now</h2>
        <p>The bottles these drinks need are empty - ask for a refill.</p>
      </div>
    );
  }

  const turn = (by: number) => setIndex((i) => (((i % count) + by + count) % count));
  const step = (2 * Math.PI) / Math.max(count, MIN_SLOTS);
  const cardW = Math.min(size.w * 0.56, size.h * 0.62, 280);
  const radiusX = size.w * 0.34;
  const radiusY = size.h * 0.2;

  function onPointerDown(e: React.PointerEvent) {
    dragStartX.current = e.clientX;
  }
  function onPointerUp(e: React.PointerEvent) {
    const startX = dragStartX.current;
    dragStartX.current = null;
    if (startX === null) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) <= SWIPE_PX) return;
    turn(dx < 0 ? 1 : -1);
    // Swallow the click that follows a swipe.
    justSwiped.current = true;
    window.setTimeout(() => (justSwiped.current = false), 0);
  }

  return (
    <div className="carousel">
      <div
        className="ring"
        ref={stage}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (dragStartX.current = null)}>
        {size.w > 0 &&
          recipes.map((recipe, i) => {
            // Signed distance from the front card, wrapped to the shorter way round.
            let delta = i - index;
            if (delta > count / 2) delta -= count;
            if (delta < -count / 2) delta += count;
            const angle = delta * step;
            const depth = (Math.cos(angle) + 1) / 2; // 1 at the front, 0 at the back
            const x = Math.sin(angle) * radiusX;
            const y = (Math.cos(angle) - 0.35) * radiusY;
            const scale = 0.42 + 0.58 * depth;
            const front = delta === 0;
            return (
              <button
                key={recipe.name ?? recipe.friendlyname}
                className={`ring__card${front ? ' ring__card--front' : ''}`}
                style={{
                  ['--drink' as string]: rgbString(drinkColor(recipe)),
                  width: cardW,
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale})`,
                  opacity: front ? 1 : 0.3 + 0.55 * depth,
                  zIndex: Math.round(depth * 100),
                }}
                onClick={() => {
                  if (justSwiped.current) return;
                  if (front) onSelect(recipe);
                  else setIndex(i);
                }}
                aria-label={front ? `${recipe.friendlyname}. Tap to choose.` : `Show ${recipe.friendlyname}`}>
                <img src={recipeImage(recipe)} alt="" draggable={false} />
              </button>
            );
          })}
      </div>

      <p className="ring__title" aria-live="polite">
        {recipes[index].friendlyname}
      </p>

      <button className="carousel__arrow carousel__arrow--prev" onClick={() => turn(-1)} aria-label="Previous drink">
        <Icon name="back" size={32} />
      </button>
      <button className="carousel__arrow carousel__arrow--next" onClick={() => turn(1)} aria-label="Next drink">
        <Icon name="back" size={32} className="carousel__flip" />
      </button>
    </div>
  );
}
