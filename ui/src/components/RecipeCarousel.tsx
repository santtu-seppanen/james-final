import {useContext, useLayoutEffect, useRef, useState} from 'react';
import {StageRotation} from '../stageRotation';
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
const PX_PER_DRINK = 90; // how far a finger drags the ring by one drink
const TAP_SLOP_PX = 8;

export function RecipeCarousel({recipes, index, onIndex, fresh}: Props) {
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({w: 0, h: 0});
  const rotation = useContext(StageRotation);
  // While a finger is down the ring follows it: `drag` is how many drinks it has been turned.
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const finger = useRef<{start: number; moved: boolean; turned: number} | null>(null);
  const justDragged = useRef(false);
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
  const position = front - drag; // fractional while dragging
  const step = (2 * Math.PI) / Math.max(count, MIN_SLOTS);
  const imageSize = Math.min(size.w * 0.46, size.h * 0.52, 230);
  const radiusX = size.w * 0.34;
  const radiusY = size.h * 0.2;
  const current = recipes[front];

  // Along the portrait horizontal, whatever the screen is doing underneath.
  const along = (e: React.PointerEvent) => (rotation === 90 ? e.clientY : rotation === 270 ? -e.clientY : e.clientX);

  function onPointerDown(e: React.PointerEvent) {
    finger.current = {start: along(e), moved: false, turned: 0};
  }
  function onPointerMove(e: React.PointerEvent) {
    const f = finger.current;
    if (!f) return;
    const d = along(e) - f.start;
    if (Math.abs(d) > TAP_SLOP_PX) f.moved = true;
    if (f.moved) {
      f.turned = d / PX_PER_DRINK;
      setDragging(true);
      setDrag(f.turned);
    }
  }
  function onPointerEnd(commit: boolean) {
    const f = finger.current;
    finger.current = null;
    if (!f) return;
    if (f.moved) {
      if (commit) onIndex((((Math.round(front - f.turned) % count) + count) % count));
      // Swallow the click that follows a drag.
      justDragged.current = true;
      window.setTimeout(() => (justDragged.current = false), 0);
    }
    setDrag(0);
    setDragging(false);
  }

  return (
    <div className="carousel">
      <div
        className="orbit"
        ref={stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => onPointerEnd(true)}
        onPointerCancel={() => onPointerEnd(false)}>
        {size.w > 0 &&
          recipes.map((recipe, i) => {
            // Signed distance from the front, wrapped to the shorter way round.
            let delta = i - position;
            if (delta > count / 2) delta -= count;
            if (delta < -count / 2) delta += count;
            const angle = delta * step;
            const depth = (Math.cos(angle) + 1) / 2; // 1 at the front, 0 at the back
            const x = Math.sin(angle) * radiusX;
            const y = (Math.cos(angle) - 0.35) * radiusY;
            const scale = 0.42 + 0.58 * depth;
            const isFront = i === front;
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
                  transition: dragging ? 'none' : undefined,
                }}
                tabIndex={isFront ? -1 : 0}
                onClick={() => {
                  if (!justDragged.current && !isFront) onIndex(i);
                }}
                aria-label={isFront ? recipe.friendlyname : `Show ${recipe.friendlyname}`}>
                <img src={recipeImage(recipe)} alt="" draggable={false} />
              </button>
            );
          })}
      </div>

      <div className="orbit__info" aria-live="polite">
        <p className="orbit__title">{current.friendlyname}</p>
        <p className="orbit__ingredients">{current.ingredients.map((ing) => ing.name).join(' · ')}</p>
        {fresh && current === fresh && <p className="orbit__fresh">Fresh from the AI - pour it and it joins the menu</p>}
      </div>
    </div>
  );
}
