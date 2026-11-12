import {useEffect, useRef, useState} from 'react';
import io, {type Socket} from 'socket.io-client';
// Socket's shape comes from src/socketio-client.d.ts.
import type {Bottle, PourResult, Recipe, ServoStateEvent} from './types';
import {API_BASE, getBottles, getRecipes, getVersion, pourAdHoc, pourByName, pourShots, saveRecipe} from './api';
import {DONE_SECONDS} from './config';
import {humanPourError} from './pourError';
import {shotBottleName} from './shots';
import {HomeScreen} from './components/HomeScreen';
import {PouringScreen} from './components/PouringScreen';
import {DoneScreen} from './components/DoneScreen';
import {GlassPrompt} from './components/GlassPrompt';
import {LoadingScreen, LockedScreen, OfflineScreen} from './components/SystemStates';

// The whole guest flow: home (the ring + Pour) -> pouring (first asking for
// the glass, then the countdown) -> done -> home.
// locked/offline/loading are overlays decided below, so any screen can
// fall into them.
type View = 'home' | 'pouring' | 'done';

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
  const [aiDrink, setAiDrink] = useState<Recipe | null>(null);
  const [shotMode, setShotMode] = useState(false);
  const [isAi, setIsAi] = useState(false);
  const [savedAs, setSavedAs] = useState<string | null>(null);
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

  function goHome() {
    setSelectedDrink(null);
    setSavedAs(null);
    setPour(null);
    setView('home');
  }

  // Pour pressed: show the pour screen with the glass prompt on top. Nothing
  // is poured until the guest confirms the glass (startPour).
  function beginPour(recipe: Recipe, ai: boolean) {
    setSelectedDrink(recipe);
    setIsAi(ai);
    setSavedAs(null);
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
        : isAi
          ? await pourAdHoc(recipe)
          : await pourByName(recipe.name || recipe.friendlyname);
      if (!result.success) return humanPourError(result.error);
      setPour({result, show: false});
      // Serving an AI drink is accepting it: it goes on the menu too. A
      // failed save never gets in the way of the pour that already started.
      if (isAi) {
        setAiDrink(null);
        saveRecipe(recipe.friendlyname, recipe)
          .then((saved) => {
            setRecipes((prev) => [...prev, {...recipe, name: saved.id, friendlyname: saved.friendlyname}]);
            setSavedAs(saved.friendlyname);
          })
          .catch(() => setSavedAs(null));
      }
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

  if (view === 'done' && selectedDrink) {
    return <DoneScreen recipe={selectedDrink} savedAs={savedAs} autoReturnSeconds={DONE_SECONDS} onHome={goHome} />;
  }

  return (
    <HomeScreen
      bottles={bottles}
      recipes={recipes}
      aiDrink={aiDrink}
      onAiDrink={setAiDrink}
      shotMode={shotMode}
      onShotMode={setShotMode}
      onPour={beginPour}
    />
  );
}
