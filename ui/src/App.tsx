import {useEffect, useRef, useState} from 'react';
import io, {type Socket} from 'socket.io-client';
// Socket's shape comes from src/socketio-client.d.ts.
import type {Bottle, PourResult, Recipe, ServoStateEvent} from './types';
import {API_BASE, generateAiDrink, getBottles, getRecipes, getVersion, pourByName, pourShots, saveRecipe} from './api';
import {DONE_SECONDS} from './config';
import {humanPourError} from './pourError';
import {shotBottleName} from './shots';
import {AiDrinkScreen} from './components/AiDrinkScreen';
import {HomeScreen} from './components/HomeScreen';
import {PouringScreen} from './components/PouringScreen';
import {DoneScreen} from './components/DoneScreen';
import {GlassPrompt} from './components/GlassPrompt';
import {LoadingScreen, LockedScreen, OfflineScreen} from './components/SystemStates';

// The whole guest flow: home (the ring + Pour) -> pouring (first asking for
// the glass, then the countdown) -> done -> home. An AI drink gets a page
// of its own between home and the menu ('ai').
// locked/offline/loading are overlays decided below, so any screen can
// fall into them.
type View = 'home' | 'ai' | 'pouring' | 'done';

// How long the socket may be down before we admit the backend is gone -
// deploy.sh restarts it in well under this, and a flash of "offline"
// during every deploy would be worse than a short delay.
const OFFLINE_GRACE_MS = 4000;

// A new version is picked up on its own, but only from the home screen so
// nobody's pour countdown gets yanked away.
const VERSION_POLL_MS = 30_000;

export default function App() {
  const [view, setView] = useState<View>('home');
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [servos, setServos] = useState<boolean[]>(new Array(6).fill(false));
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [locked, setLocked] = useState(false);
  const [stale, setStale] = useState(false);
  const [selectedDrink, setSelectedDrink] = useState<Recipe | null>(null);
  const [aiDrink, setAiDrink] = useState<Recipe | null>(null); // invented, not yet on the menu
  const [aiError, setAiError] = useState<string | null>(null);
  // Backing out just ignores the answer when it arrives - the request itself can't be aborted.
  const aiRequest = useRef(0);
  const [focusDrink, setFocusDrink] = useState<string | null>(null); // menu id the ring opens on
  const [shotMode, setShotMode] = useState(false);
  const [pour, setPour] = useState<{result: PourResult; show: boolean} | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    let offlineTimer = 0;
    const markOffline = () => {
      window.clearTimeout(offlineTimer);
      offlineTimer = window.setTimeout(() => setOffline(true), OFFLINE_GRACE_MS);
    };
    const markOnline = () => {
      window.clearTimeout(offlineTimer);
      setOffline(false);
    };

    Promise.all([getBottles(), getRecipes()])
      .then(([b, r]) => {
        setBottles(b);
        setRecipes(r);
        setLoaded(true);
      })
      .catch(markOffline);

    const socket = io(API_BASE);
    socketRef.current = socket;
    socket.on('connect', markOnline);
    socket.on('disconnect', markOffline);
    socket.on('connect_error', markOffline);
    socket.on('servoState', (...args: unknown[]) => {
      const data = args[0] as ServoStateEvent;
      if (data.servos) setServos(data.servos);
      if (data.bottles) setBottles(data.bottles);
      if (data.drinks) setRecipes(data.drinks);
      if (typeof data.estop === 'boolean') setLocked(data.estop);
      setLoaded(true);
      markOnline();
    });

    return () => {
      window.clearTimeout(offlineTimer);
      socket.disconnect();
    };
  }, []);

  // The build's own version is baked in (__APP_VERSION__); deploy.sh writes
  // the same SHA to server/VERSION once the new build is being served.
  useEffect(() => {
    const check = () => {
      getVersion()
        .then((data) => {
          if (data.version && data.version !== 'unknown' && data.version !== __APP_VERSION__) setStale(true);
        })
        .catch(() => {
          // Backend mid-restart during a deploy - the next poll catches up.
        });
    };
    check();
    const id = window.setInterval(check, VERSION_POLL_MS);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (stale && view === 'home') window.location.reload();
  }, [stale, view]);

  // The AI page opens at once and shows the thinking state until James answers.
  function inventDrink() {
    const id = ++aiRequest.current;
    setAiDrink(null);
    setAiError(null);
    setView('ai');
    generateAiDrink()
      .then((recipe) => {
        if (id === aiRequest.current) setAiDrink(recipe);
      })
      .catch((e) => {
        if (id === aiRequest.current) setAiError(humanAiError(e instanceof Error ? e.message : ''));
      });
  }

  function leaveAiPage() {
    aiRequest.current++;
    setAiDrink(null);
    setAiError(null);
    setView('home');
  }

  function goHome() {
    setSelectedDrink(null);
    setPour(null);
    setView('home');
  }

  // Pour pressed: show the pour screen with the glass prompt on top. Nothing
  // is poured until the guest confirms the glass (startPour).
  function beginPour(recipe: Recipe) {
    setSelectedDrink(recipe);
    setPour(null);
    setView('pouring');
  }

  // Resolves to an error message, or null once the pour has started.
  async function startPour(): Promise<string | null> {
    const recipe = selectedDrink;
    if (!recipe) return humanPourError();
    const shotBottle = shotBottleName(recipe);
    try {
      const result = shotBottle
        ? await pourShots(shotBottle)
        : await pourByName(recipe.name || recipe.friendlyname);
      if (!result.success) return humanPourError(result.error);
      setPour({result, show: false});
      return null;
    } catch (e) {
      return humanPourError(e instanceof Error ? e.message : '');
    }
  }

  if (locked) {
    return <LockedScreen onClear={() => setLocked(false)} />;
  }

  // A pour already running on the Pi finishes on its own - keep showing
  // the countdown rather than hiding it behind the offline screen.
  if (offline && view !== 'pouring') {
    return <OfflineScreen />;
  }

  if (!loaded) {
    return <LoadingScreen />;
  }

  if (view === 'pouring' && selectedDrink) {
    return (
      <>
        <PouringScreen
          key={pour ? 'pour' : 'wait'}
          recipe={selectedDrink}
          bottles={bottles}
          servos={servos}
          result={pour ? pour.result : null}
          show={false}
          onDone={() => setView('done')}
        />
        {!pour && <GlassPrompt shots={shotBottleName(selectedDrink) !== null} onConfirm={startPour} onCancel={goHome} />}
      </>
    );
  }

  if (view === 'ai') {
    return (
      <AiDrinkScreen
        recipe={aiDrink}
        error={aiError}
        onRetry={inventDrink}
        onAdd={async () => {
          if (!aiDrink) return;
          const saved = await saveRecipe(aiDrink.friendlyname, aiDrink);
          setRecipes((prev) => [...prev, {...aiDrink, name: saved.id, friendlyname: saved.friendlyname}]);
          setFocusDrink(saved.id);
          leaveAiPage();
        }}
        onAbandon={leaveAiPage}
      />
    );
  }

  if (view === 'done' && selectedDrink) {
    return <DoneScreen recipe={selectedDrink} autoReturnSeconds={DONE_SECONDS} onHome={goHome} />;
  }

  return (
    <HomeScreen
      bottles={bottles}
      recipes={recipes}
      focusDrink={focusDrink}
      onInvent={inventDrink}
      shotMode={shotMode}
      onShotMode={setShotMode}
      onPour={beginPour}
    />
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
