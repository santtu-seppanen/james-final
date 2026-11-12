import {useEffect, useRef, useState} from 'react';
import type {Bottle, Recipe} from '../types';
import {generateAiDrink} from '../api';
import {availability} from '../drinkColor';
import {SHOT_COUNT, shotRecipes} from '../shots';
import {RecipeCarousel} from './RecipeCarousel';
import {Icon} from './Icon';

interface Props {
  bottles: Bottle[];
  recipes: Recipe[];
  // Menu id of a drink the ring should open on (one just added from the AI page).
  focusDrink: string | null;
  // The AI invented a drink: App shows it on its own page.
  onAiDrink: (recipe: Recipe) => void;
  // "5 viinaa": shot glasses instead of one glass, one bottle at a time.
  shotMode: boolean;
  onShotMode: (on: boolean) => void;
  // Starts the pour flow (which first asks for the glass).
  onPour: (recipe: Recipe) => void;
}

const SPIN_MS = 4000; // the ring turns by itself ...
const PAUSE_MS = 12000; // ... except for this long after someone touches it

export function HomeScreen({bottles, recipes, focusDrink, onAiDrink, shotMode, onShotMode, onPour}: Props) {
  const [index, setIndex] = useState(() =>
    Math.max(0, recipes.filter((r) => availability(r, bottles).pourable).findIndex((r) => r.name === focusDrink)),
  );
  const [aiState, setAiState] = useState<'idle' | 'thinking' | 'failed'>('idle');
  const [aiError, setAiError] = useState('');
  // Cancelling just ignores the answer when it arrives - the request
  // itself can't be aborted on the server side.
  const aiRequest = useRef(0);
  const lastTouch = useRef(0);

  const pourable = shotMode ? shotRecipes(bottles) : recipes.filter((r) => availability(r, bottles).pourable);
  const items = pourable;
  const front = items.length > 0 ? ((index % items.length) + items.length) % items.length : 0;

  const touch = () => {
    lastTouch.current = Date.now();
  };

  useEffect(() => {
    if (items.length < 2 || aiState !== 'idle') return;
    const id = window.setInterval(() => {
      if (Date.now() - lastTouch.current > PAUSE_MS) setIndex((i) => i + 1);
    }, SPIN_MS);
    return () => window.clearInterval(id);
  }, [items.length, aiState]);

  function surprise() {
    if (pourable.length === 0) return;
    touch();
    const pick = pourable[Math.floor(Math.random() * pourable.length)];
    setIndex(items.indexOf(pick));
  }

  async function aiDrinkRequest() {
    touch();
    const id = ++aiRequest.current;
    setAiState('thinking');
    setAiError('');
    try {
      const recipe = await generateAiDrink();
      if (id !== aiRequest.current) return;
      setAiState('idle');
      onAiDrink(recipe);
    } catch (e) {
      if (id !== aiRequest.current) return;
      setAiState('failed');
      setAiError(humanAiError(e instanceof Error ? e.message : ''));
    }
  }

  function cancelAi() {
    aiRequest.current++;
    setAiState('idle');
  }

  function pour() {
    const recipe = items[front];
    if (recipe) onPour(recipe);
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
        {!shotMode && (
          <button
            className="pill pill--ai"
            onClick={aiDrinkRequest}
            disabled={aiState === 'thinking'}
            aria-label="AI drink: invent a new cocktail from the loaded bottles">
            <Icon name="robot" size={22} /> AI drink
          </button>
        )}
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
          Pour the drink
        </button>
      </div>

      {aiState !== 'idle' && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="AI drink">
          <div className="modal modal--ai">
            {aiState === 'thinking' ? (
              <>
                <div className="spinner spinner--ai" aria-hidden="true" />
                <h2 className="modal__title">Mixing up an idea…</h2>
                <p className="modal__text">James is looking at the bottles and inventing something new.</p>
                <button className="button button--lg" onClick={cancelAi}>
                  Never mind
                </button>
              </>
            ) : (
              <>
                <Icon name="warning" size={56} className="modal__icon modal__icon--warn" />
                <h2 className="modal__title">No inspiration right now</h2>
                <p className="modal__text">{aiError}</p>
                <div className="modal__actions">
                  <button className="button button--primary button--lg" onClick={aiDrinkRequest}>
                    Try again
                  </button>
                  <button className="button button--lg" onClick={cancelAi}>
                    Back to menu
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Server errors are developer-facing ("ANTHROPIC_API_KEY not set"); turn
// the known ones into something a guest can act on. Never JSON.
function humanAiError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('api_key')) return 'The AI bartender isn’t set up on this machine. Pick a drink from the menu instead.';
  if (m.includes('two loaded bottles')) return 'Needs at least two loaded bottles to invent something. Ask for a refill.';
  if (m.includes('fetch') || m.includes('network')) return 'No internet connection for the AI bartender. Pick a drink from the menu instead.';
  return 'The AI bartender came up empty. Try again, or pick something from the menu.';
}
