import {useEffect, useRef, useState} from 'react';
import io, {type Socket} from 'socket.io-client';
// Socket's shape comes from src/socketio-client.d.ts.
import type {Bottle, Recipe, ServoStateEvent} from './types';
import {API_BASE, getBottles, getRecipes, saveRecipe} from './api';
import {BottleList} from './components/BottleList';
import {RecipeGrid} from './components/RecipeGrid';
import {PourScreen} from './components/PourScreen';
import {AiGenerateButton} from './components/AiGenerateButton';
import {SaveDrinkModal} from './components/SaveDrinkModal';
import {InfoToast} from './components/InfoToast';
import {BottleAdmin} from './components/BottleAdmin';
import {RecipeAdmin} from './components/RecipeAdmin';
import {VersionBanner} from './components/VersionBanner';

type View = 'home' | 'pour' | 'bottleAdmin' | 'recipeAdmin';

export default function App() {
  const [view, setView] = useState<View>('home');
  const [bottles, setBottles] = useState<Bottle[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [servos, setServos] = useState<boolean[]>(new Array(8).fill(false));
  const [selectedDrink, setSelectedDrink] = useState<Recipe | null>(null);
  const [isAiDrink, setIsAiDrink] = useState(false);
  const [pendingSave, setPendingSave] = useState<Recipe | null>(null);
  const [toast, setToast] = useState('');
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    getBottles().then(setBottles);
    getRecipes().then(setRecipes);

    const socket = io(API_BASE);
    socketRef.current = socket;
    socket.on('servoState', (...args: unknown[]) => {
      const data = args[0] as ServoStateEvent;
      if (data.servos) setServos(data.servos);
      if (data.bottles) setBottles(data.bottles);
      if (data.drinks) setRecipes(data.drinks);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 3000);
  }

  function selectRecipe(recipe: Recipe) {
    setSelectedDrink(recipe);
    setIsAiDrink(false);
    setView('pour');
  }

  function generateAiDrink(recipe: Recipe) {
    setSelectedDrink(recipe);
    setIsAiDrink(true);
    setView('pour');
  }

  function cancelPour() {
    setSelectedDrink(null);
    setView('home');
  }

  function drinkPoured(recipe: Recipe) {
    const manualIngredients = recipe.ingredients.filter((i) => i.manual);
    if (manualIngredients.length === 0) {
      showToast('Drink ready, enjoy!');
    } else {
      const parts = manualIngredients.map((i) => `${i.serving}ml of ${i.name}`);
      showToast(`Drink poured, add ${parts.join(', ')} and enjoy`);
    }

    if (isAiDrink) {
      setPendingSave(recipe);
    } else {
      setSelectedDrink(null);
      setView('home');
    }
  }

  async function handleSaveDrink(name: string) {
    if (!pendingSave) return;
    const result = await saveRecipe(name, pendingSave);
    setRecipes((prev) => [...prev, {...pendingSave, name: result.id, friendlyname: result.friendlyname}]);
    setPendingSave(null);
    setSelectedDrink(null);
    setView('home');
  }

  function skipSaveDrink() {
    setPendingSave(null);
    setSelectedDrink(null);
    setView('home');
  }

  if (view === 'bottleAdmin') {
    return <BottleAdmin onBack={() => setView('home')} />;
  }

  if (view === 'recipeAdmin') {
    return <RecipeAdmin onBack={() => setView('home')} />;
  }

  if (view === 'pour' && selectedDrink) {
    return (
      <>
        <PourScreen
          recipe={selectedDrink}
          bottles={bottles}
          servos={servos}
          isAiDrink={isAiDrink}
          onCancel={cancelPour}
          onPoured={drinkPoured}
        />
        {pendingSave && (
          <SaveDrinkModal
            defaultName={pendingSave.friendlyname}
            onSave={handleSaveDrink}
            onSkip={skipSaveDrink}
          />
        )}
        <InfoToast message={toast} />
      </>
    );
  }

  return (
    <div className="home">
      <VersionBanner />
      <aside className="home__bottles">
        <BottleList bottles={bottles} />
      </aside>
      <main className="home__main">
        <AiGenerateButton onGenerated={generateAiDrink} />
        <RecipeGrid recipes={recipes} onSelect={selectRecipe} />
        <div className="home__admin-links">
          <button className="icon-button" onClick={() => setView('recipeAdmin')} title="Recipes admin">
            📖
          </button>
          <button className="icon-button" onClick={() => setView('bottleAdmin')} title="Bottles admin">
            🍾
          </button>
        </div>
      </main>
      <InfoToast message={toast} />
    </div>
  );
}
