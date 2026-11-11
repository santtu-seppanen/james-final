import {useEffect, useRef, useState} from 'react';
import type {Bottle, Recipe} from '../types';
import {generateAiDrink} from '../api';
import {availability} from '../drinkColor';
import {RecipeCarousel} from './RecipeCarousel';
import {Icon} from './Icon';

interface Props {
  bottles: Bottle[];
  recipes: Recipe[];
  // An AI drink waiting in the ring, not yet on the menu.
  aiDrink: Recipe | null;
  onAiDrink: (recipe: Recipe | null) => void;
  // Pours the drink; resolves to an error message, or null when it started.
  onServe: (recipe: Recipe, isAi: boolean) => Promise<string | null>;
}

const SPIN_MS = 4000; // the ring turns by itself ...
const PAUSE_MS = 12000; // ... except for this long after someone touches it

export function HomeScreen({bottles, recipes, aiDrink, onAiDrink, onServe}: Props) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [aiState, setAiState] = useState<'idle' | 'thinking' | 'failed'>('idle');
  const [aiError, setAiError] = useState('');
  // Cancelling just ignores the answer when it arrives - the request
  // itself can't be aborted on the server side.
  const aiRequest = useRef(0);
  const lastTouch = useRef(0);

  const pourable = recipes.filter((r) => availability(r, bottles).pourable);
  const items = aiDrink ? [aiDrink, ...pourable] : pourable;
  const front = items.length > 0 ? ((index % items.length) + items.length) % items.length : 0;

  const touch = () => {
    lastTouch.current = Date.now();
    setError('');
  };

  useEffect(() => {
    if (items.length < 2 || busy || aiState !== 'idle') return;
    const id = window.setInterval(() => {
      if (Date.now() - lastTouch.current > PAUSE_MS) setIndex((i) => i + 1);
    }, SPIN_MS);
    return () => window.clearInterval(id);
  }, [items.length, busy, aiState]);

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
      setIndex(0);
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

  async function pour() {
    const recipe = items[front];
    if (!recipe || busy) return;
    setBusy(true);
    setError('');
    const problem = await onServe(recipe, recipe === aiDrink);
    // On success App has already moved on to the pouring screen.
    if (problem) setError(problem);
    setBusy(false);
  }

  return (
    <div className="home" onPointerDown={touch}>
      <div className="home__top">
        <button
          className="pill pill--surprise"
          onClick={surprise}
          disabled={pourable.length === 0}
          aria-label="Surprise me: turn the ring to a random drink">
          <Icon name="sparkles" size={28} /> Surprise me
        </button>
        <button
          className="pill pill--ai"
          onClick={aiDrinkRequest}
          disabled={aiState === 'thinking'}
          aria-label="AI drink: invent a new cocktail from the loaded bottles">
          <Icon name="robot" size={28} /> AI drink
        </button>
      </div>

      <RecipeCarousel recipes={items} index={front} onIndex={(i) => (touch(), setIndex(i))} fresh={aiDrink} />

      <div className="home__pour">
        {error && (
          <p className="notice notice--error" role="alert">
            <Icon name="warning" /> {error}
          </p>
        )}
        <button className="button button--primary button--xl pour-button" onClick={pour} disabled={busy || items.length === 0}>
          {busy ? 'Starting…' : 'Pour the drink'}
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
