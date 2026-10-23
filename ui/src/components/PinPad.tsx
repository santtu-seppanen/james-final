import {useState} from 'react';
import {ADMIN_PIN} from '../config';

const BUTTONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '#', 'back'];

export function PinPad({onAuthorised, onBack}: {onAuthorised: () => void; onBack: () => void}) {
  const [code, setCode] = useState('');
  const [wrong, setWrong] = useState(false);

  function press(button: string) {
    if (button === 'back') {
      onBack();
      return;
    }

    const next = code + button;
    if (next === ADMIN_PIN) {
      onAuthorised();
      setCode('');
      return;
    }

    if (next.length >= ADMIN_PIN.length) {
      setWrong(true);
      setCode('');
      window.setTimeout(() => setWrong(false), 1500);
      return;
    }

    setCode(next);
  }

  return (
    <div className="pin-pad">
      {wrong && <p className="pin-pad__error">Wrong code</p>}
      <div className="pin-pad__grid">
        {BUTTONS.map((button) => (
          <button key={button} className="pin-pad__button" onClick={() => press(button)}>
            {button}
          </button>
        ))}
      </div>
    </div>
  );
}
