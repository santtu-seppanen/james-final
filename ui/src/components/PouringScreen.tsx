import {useEffect, useRef, useState} from 'react';
import type {Bottle, PourResult, Recipe} from '../types';
import {drinkColor, rgbString} from '../drinkColor';
import {features} from '../features';
import {useCountdown} from '../hooks';
import {recipeImage} from '../images';
import {BottleStrip} from './BottleStrip';
import {Icon} from './Icon';

interface Props {
  recipe: Recipe;
  bottles: Bottle[];
  servos: boolean[];
  result: PourResult;
  show: boolean;
  onDone: () => void;
}

// State diagram (pouring + show), see also ui/README.md:
//
//   confirm --/drinkme ok--> pouring --pourTime elapsed--> done
//                              |  \
//                              |   `-- Skip show (show on) -> pouring, music off
//                              `-- E-stop (feature) -> locked (PIN to clear)
//
// The countdown is local: the server returns pourTime and fires servo
// timers on its own, so this screen just has to look right until then.
export function PouringScreen({recipe, bottles, servos, result, show, onDone}: Props) {
  const color = drinkColor(recipe);
  const secondsLeft = useCountdown(result.pourTime);
  const [skipped, setSkipped] = useState(false);
  const finished = useRef(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      finished.current = true;
      onDone();
    }, result.pourTime);
    return () => window.clearTimeout(id);
    // onDone identity may change on parent re-render; the timer only needs
    // to fire once for this pour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.pourTime]);

  // Beat pulse: the backend will return show.bpm once show mode exists
  // (issue #4). Fixed-BPM fallback is silent, as the prompt asks.
  const bpm = show && !skipped ? (result.show && result.show.bpm) || 120 : 0;
  const beatMs = bpm > 0 ? Math.round(60000 / bpm) : 0;

  const activeIndex = servos.findIndex(Boolean);
  const activeBottle = activeIndex >= 0 ? bottles[activeIndex] : undefined;
  const total = Math.ceil(result.pourTime / 1000);
  const progress = total > 0 ? 1 - secondsLeft / total : 0;

  return (
    <div
      className={`pouring${beatMs ? ' pouring--beat' : ''}`}
      style={{
        ['--drink' as string]: rgbString(color),
        ['--drink-soft' as string]: rgbString(color, 0.22),
        ['--beat' as string]: `${beatMs}ms`,
      }}
      aria-live="polite">
      <div className="pouring__bg" aria-hidden="true" />

      <header className="pouring__header">
        <img src={recipeImage(recipe)} alt="" className="pouring__thumb" aria-hidden="true" />
        <div>
          <p className="pouring__eyebrow">Now pouring</p>
          <h1 className="pouring__name">{recipe.friendlyname}</h1>
        </div>
        {show && !skipped && result.show && result.show.track && (
          <p className="pouring__track">
            <Icon name="music" /> {result.show.track}
          </p>
        )}
      </header>

      <div className="pouring__center">
        <div className="pouring__count" role="timer" aria-label={`${secondsLeft} seconds left`}>
          {secondsLeft}
        </div>
        <p className="pouring__status">
          {activeBottle && activeBottle.name !== 'empty' ? `Pouring ${activeBottle.name}` : secondsLeft > 0 ? 'Getting ready…' : 'Almost done'}
        </p>
        <div className="progress" aria-hidden="true">
          <div className="progress__bar" style={{width: `${Math.round(progress * 100)}%`}} />
        </div>
      </div>

      <div className="pouring__bottles">
        <BottleStrip bottles={bottles} active={servos} activeColor={rgbString(color)} layout="horizontal" />
      </div>

      <footer className="pouring__actions">
        {show && !skipped && (
          <button className="button button--lg button--ghost" onClick={() => setSkipped(true)}>
            <Icon name="music" /> Skip show
          </button>
        )}
        {features.estop && (
          <button className="button button--danger button--lg" onClick={() => {/* POST /api/estop, issue #9 */}}>
            <Icon name="stop" size={28} /> Stop
          </button>
        )}
      </footer>
    </div>
  );
}
