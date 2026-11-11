import {useLayoutEffect, useRef, useState} from 'react';
import type {Recipe} from '../types';
import {recipeImage} from '../images';
import {drinkColor, rgbString} from '../drinkColor';
import {Icon} from './Icon';

interface Props {
  recipes: Recipe[];
  index: number;
  onIndex: (index: number) => void;
  // The AI drink that isn't on the menu yet, if it's in the ring.
  fresh?: Recipe | null;
}

// A ring of drink pictures seen at an angle: the drink in front is big and
// glowing, the rest curve away behind it. No cards, no frames. Only the
// front drink is named, with its ingredients underneath. Whatever is in
// front is what the Pour button serves.
const MIN_SLOTS = 9; // keep it looking like a ring with only a few drinks
const SWIPE_PX = 40;

export function RecipeCarousel({recipes, index, onIndex, fresh}: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({w: 0, h: 0});
  const dragStartX = useRef<number | null>(null);
  const justSwiped = useRef(false);
  const count = recipes.length;
  const hasCards = count > 0;

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

  const front = ((index % count) + count) % count;
  const turn = (by: number) => onIndex((((front + by) % count) + count) % count);
  const step = (2 * Math.PI) / Math.max(count, MIN_SLOTS);
  const imageSize = Math.min(size.w * 0.56, size.h * 0.62, 280);
  const radiusX = size.w * 0.34;
  const radiusY = size.h * 0.2;
  const current = recipes[front];

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
        className="orbit"
        ref={stage}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (dragStartX.current = null)}>
        {size.w > 0 &&
          recipes.map((recipe, i) => {
            // Signed distance from the front, wrapped to the shorter way round.
            let delta = i - front;
            if (delta > count / 2) delta -= count;
            if (delta < -count / 2) delta += count;
            const angle = delta * step;
            const depth = (Math.cos(angle) + 1) / 2; // 1 at the front, 0 at the back
            const x = Math.sin(angle) * radiusX;
            const y = (Math.cos(angle) - 0.35) * radiusY;
            const scale = 0.42 + 0.58 * depth;
            const isFront = delta === 0;
            return (
              <button
                key={recipe.name ?? recipe.friendlyname}
                className={`orbit__card${isFront ? ' orbit__card--front' : ''}`}
                style={{
                  ['--drink' as string]: rgbString(drinkColor(recipe)),
                  width: imageSize,
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${scale})`,
                  opacity: isFront ? 1 : 0.3 + 0.55 * depth,
                  zIndex: Math.round(depth * 100),
                }}
                tabIndex={isFront ? -1 : 0}
                onClick={() => {
                  if (!justSwiped.current && !isFront) onIndex(i);
                }}
                aria-label={isFront ? recipe.friendlyname : `Show ${recipe.friendlyname}`}>
                <img src={recipeImage(recipe)} alt="" draggable={false} />
              </button>
            );
          })}

        <button className="carousel__arrow carousel__arrow--prev" onClick={() => turn(-1)} aria-label="Previous drink">
          <Icon name="back" size={32} />
        </button>
        <button className="carousel__arrow carousel__arrow--next" onClick={() => turn(1)} aria-label="Next drink">
          <Icon name="back" size={32} className="carousel__flip" />
        </button>
      </div>

      <div className="orbit__info" aria-live="polite">
        <p className="orbit__title">{current.friendlyname}</p>
        <p className="orbit__ingredients">{current.ingredients.map((ing) => ing.name).join(' · ')}</p>
        {fresh && current === fresh && <p className="orbit__fresh">Fresh from the AI - pour it and it joins the menu</p>}
      </div>
    </div>
  );
}
