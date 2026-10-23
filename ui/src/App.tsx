import {useEffect, useRef, useState} from 'react';
import io, {type Socket} from 'socket.io-client';
// Socket's shape comes from src/socketio-client.d.ts.
import type {Bottle, Recipe, ServoStateEvent} from './types';
import {API_BASE, getBottles, getRecipes} from './api';
import {BottleList} from './components/BottleList';
import {RecipeGrid} from './components/RecipeGrid';
import {PourScreen} from './components/PourScreen';
import {SurpriseButton} from './components/SurpriseButton';
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
          onCancel={cancelPour}
          onPoured={drinkPoured}
        />
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
        <SurpriseButton recipes={recipes} onPick={selectRecipe} />
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
