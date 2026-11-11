import {useRef, useState} from 'react';
import type {Bottle, Recipe} from '../types';
import {generateAiDrink} from '../api';
import {availability} from '../drinkColor';
import {features} from '../features';
import {BottleStrip} from './BottleStrip';
import {RecipeGrid} from './RecipeGrid';
import {Icon} from './Icon';

interface Props {
  bottles: Bottle[];
  recipes: Recipe[];
  onSelect: (recipe: Recipe, isAi: boolean) => void;
  onAdmin: () => void;
}

export function HomeScreen({bottles, recipes, onSelect, onAdmin}: Props) {
  const [aiState, setAiState] = useState<'idle' | 'thinking' | 'failed'>('idle');
  const [aiError, setAiError] = useState('');
  // Cancelling just ignores the answer when it arrives - the request
  // itself can't be aborted on the server side.
  const aiRequest = useRef(0);

  const pourable = recipes.filter((r) => availability(r, bottles).pourable);

  function surprise() {
    if (pourable.length === 0) return;
    onSelect(pourable[Math.floor(Math.random() * pourable.length)], false);
  }

  async function aiDrink() {
    const id = ++aiRequest.current;
    setAiState('thinking');
    setAiError('');
    try {
      const recipe = await generateAiDrink();
      if (id !== aiRequest.current) return;
      setAiState('idle');
      onSelect(recipe, true);
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

  return (
    <div className="home">
      <aside className="home__bottles">
        <BottleStrip bottles={bottles} />
      </aside>

      <main className="home__main">
        <div className="home__top">
          <button
            className="pill pill--surprise"
            onClick={surprise}
            disabled={pourable.length === 0}
            aria-label="Surprise me: pick a random drink from the menu">
            <Icon name="sparkles" size={28} /> Surprise me
          </button>
          <button
            className="pill pill--ai"
            onClick={aiDrink}
            disabled={aiState === 'thinking'}
            aria-label="AI drink: invent a new cocktail from the loaded bottles">
            <Icon name="robot" size={28} /> AI drink
          </button>
          {features.queue && (
            <span className="home__queue" aria-label="Order queue">
              <Icon name="list" /> Queue
            </span>
          )}
        </div>

        <div className="home__grid">
          <RecipeGrid recipes={recipes} bottles={bottles} onSelect={(r) => onSelect(r, false)} />
        </div>
      </main>

      <button className="admin-corner" onClick={onAdmin} aria-label="Admin and maintenance">
        <Icon name="cog" size={26} />
      </button>

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
                  <button className="button button--primary button--lg" onClick={aiDrink}>
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
