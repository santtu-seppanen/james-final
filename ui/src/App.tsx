import {useEffect, useRef, useState} from 'react';
import io, {type Socket} from 'socket.io-client';
// Socket's shape comes from src/socketio-client.d.ts.
import type {Bottle, PourResult, Recipe, ServoStateEvent} from './types';
import {API_BASE, getBottles, getRecipes, saveRecipe} from './api';
import {useIdle} from './hooks';
import {useSettings} from './settings';
import {recordPour} from './stats';
import {HomeScreen} from './components/HomeScreen';
import {ConfirmScreen} from './components/ConfirmScreen';
import {PouringScreen} from './components/PouringScreen';
import {DoneScreen} from './components/DoneScreen';
import {AttractScreen} from './components/AttractScreen';
import {AdminScreen} from './components/admin/AdminScreen';
import {VersionBanner} from './components/VersionBanner';
import {LoadingScreen, LockedScreen, OfflineScreen} from './components/SystemStates';

// Guest flow: attract <-> home -> confirm -> pouring -> done -> home.
// admin hangs off home behind the PIN. locked/offline/loading are
// overlays decided below the switch, so any screen can fall into them.
type View = 'home' | 'confirm' | 'pouring' | 'done' | 'attract' | 'admin';

// How long the socket may be down before we admit the backend is gone -
// deploy.sh restarts it in well under this, and a flash of "offline"
// during every deploy would be worse than a short delay.
const OFFLINE_GRACE_MS = 4000;

export default function App() {
  const [view, setView] = useState<View>('home');
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [servos, setServos] = useState<boolean[]>(new Array(8).fill(false));
  const [loaded, setLoaded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [locked, setLocked] = useState(false);
  const [selectedDrink, setSelectedDrink] = useState<Recipe | null>(null);
  const [isAiDrink, setIsAiDrink] = useState(false);
  const [pour, setPour] = useState<{result: PourResult; show: boolean} | null>(null);
  const [settings, updateSettings] = useSettings();
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

  // Attract mode only from the menu - never mid-pour or inside admin.
  useIdle(settings.idleSeconds, view === 'home', () => setView('attract'));

  function selectRecipe(recipe: Recipe, ai: boolean) {
    setSelectedDrink(recipe);
    setIsAiDrink(ai);
    setView('confirm');
  }

  function goHome() {
    setSelectedDrink(null);
    setPour(null);
    setView('home');
  }

  function pourStarted(result: PourResult, show: boolean) {
    setPour({result, show});
    setView('pouring');
    if (selectedDrink) recordPour(selectedDrink, bottles);
  }

  async function handleSaveDrink(name: string) {
    if (!selectedDrink) return;
    const result = await saveRecipe(name, selectedDrink);
    setRecipes((prev) => [...prev, {...selectedDrink, name: result.id, friendlyname: result.friendlyname}]);
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

  if (view === 'admin') {
    return (
      <AdminScreen
        bottles={bottles}
        recipes={recipes}
        servos={servos}
        settings={settings}
        onSettings={updateSettings}
        onBack={goHome}
      />
    );
  }

  if (view === 'attract') {
    return <AttractScreen recipes={recipes} bottles={bottles} onWake={() => setView('home')} />;
  }

  if (view === 'confirm' && selectedDrink) {
    return (
      <>
        <VersionBanner />
        <ConfirmScreen recipe={selectedDrink} bottles={bottles} isAiDrink={isAiDrink} onBack={goHome} onStarted={pourStarted} />
      </>
    );
  }

  if (view === 'pouring' && selectedDrink && pour) {
    return (
      <PouringScreen
        recipe={selectedDrink}
        bottles={bottles}
        servos={servos}
        result={pour.result}
        show={pour.show}
        onDone={() => setView('done')}
      />
    );
  }

  if (view === 'done' && selectedDrink) {
    return (
      <DoneScreen
        recipe={selectedDrink}
        canSave={isAiDrink}
        autoReturnSeconds={settings.doneSeconds}
        onSave={handleSaveDrink}
        onHome={goHome}
      />
    );
  }

  return (
    <>
      <VersionBanner />
      <HomeScreen bottles={bottles} recipes={recipes} onSelect={selectRecipe} onAdmin={() => setView('admin')} />
    </>
  );
}
