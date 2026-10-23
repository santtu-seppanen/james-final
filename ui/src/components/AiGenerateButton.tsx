import {useState} from 'react';
import type {Recipe} from '../types';
import {generateAiDrink} from '../api';

export function AiGenerateButton({onGenerated}: {onGenerated: (recipe: Recipe) => void}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleClick() {
    setLoading(true);
    setError('');
    try {
      const recipe = await generateAiDrink();
      onGenerated(recipe);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not come up with a drink');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="ai-generate">
      <button className="button button--ai" onClick={handleClick} disabled={loading}>
        {loading ? 'Thinking...' : '✨ Surprise me'}
      </button>
      {error && <p className="ai-generate__error">{error}</p>}
    </div>
  );
}
