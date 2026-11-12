import {useState} from 'react';
import {Icon} from './Icon';

interface Props {
  // Shot mode puts five shot glasses on the belt instead of one glass.
  shots: boolean;
  // Starts the pour. Resolves to an error message, or null once it started.
  onConfirm: () => Promise<string | null>;
  onCancel: () => void;
}

// Shown over the pour screen before anything is poured. There is no glass
// sensor, so the guest has to say the glass is in place - the pour starts
// only after that.
export function GlassPrompt({shots, onConfirm, onCancel}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    setError('');
    const problem = await onConfirm();
    // On success App starts the countdown and this prompt goes away.
    if (problem) {
      setError(problem);
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Check the glass">
      <div className="modal modal--glass">
        <Icon name="glass" size={64} className="modal__icon" />
        <h2 className="modal__title">{shots ? 'Set the shot glasses' : 'Set your glass'}</h2>
        <p className="modal__text">
          {shots ? 'Put five shot glasses on the belt, then tap the button.' : 'Put your glass on the platform, then tap the button.'}
        </p>
        {error && (
          <p className="notice notice--error" role="alert">
            <Icon name="warning" /> {error}
          </p>
        )}
        <div className="modal__actions">
          <button className="button button--primary button--xl" onClick={confirm} disabled={busy}>
            {busy ? 'Starting…' : shots ? 'Glasses are ready' : 'Glass is ready'}
          </button>
          <button className="button button--lg" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
