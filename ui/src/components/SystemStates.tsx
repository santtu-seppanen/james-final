import {useState} from 'react';
import {Icon} from './Icon';
import {PinPad} from './PinPad';

// Backend unreachable (socket dropped and stayed down). Pouring already
// in progress carries on on the Pi, so App only shows this outside the
// pouring screen. Retry is a plain reload - simplest thing that also
// picks up a freshly deployed UI.
export function OfflineScreen() {
  const [retrying, setRetrying] = useState(false);
  return (
    <div className="system-screen" role="alert">
      <Icon name="offline" size={96} className="system-screen__icon" />
      <h1 className="system-screen__title">James is offline</h1>
      <p className="system-screen__text">Can't reach the bar backend. Check the Pi, then try again.</p>
      <button
        className="button button--primary button--xl"
        onClick={() => {
          setRetrying(true);
          window.location.reload();
        }}
        disabled={retrying}>
        <Icon name="refresh" /> {retrying ? 'Retrying…' : 'Try again'}
      </button>
    </div>
  );
}

// Full-screen lock after an emergency stop (issue #9). Only reachable
// once the backend emits servoState {estop: true}; clearing it will need
// an endpoint too, so for now the PIN just dismisses the screen.
export function LockedScreen({onClear}: {onClear: () => void}) {
  return (
    <div className="system-screen system-screen--locked" role="alert">
      <Icon name="stop" size={96} className="system-screen__icon" />
      <h1 className="system-screen__title">Emergency stop</h1>
      <p className="system-screen__text">All bottles are closed. Enter the PIN to put James back in service.</p>
      <PinPad title="" onAuthorised={onClear} />
    </div>
  );
}

// First load, before bottles/recipes have arrived.
export function LoadingScreen() {
  return (
    <div className="system-screen" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <h1 className="system-screen__title">Waking James up…</h1>
    </div>
  );
}
