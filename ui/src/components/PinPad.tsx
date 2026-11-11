import {useState} from 'react';
import {ADMIN_PIN} from '../config';
import {Icon} from './Icon';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

interface Props {
  title?: string;
  onAuthorised: () => void;
  onBack?: () => void;
}

export function PinPad({title = 'Enter PIN', onAuthorised, onBack}: Props) {
  const [code, setCode] = useState('');
  const [wrong, setWrong] = useState(false);

  function press(digit: string) {
    const next = code + digit;
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
      <h2 className="pin-pad__title">{title}</h2>
      <div className="pin-pad__dots" aria-live="polite" aria-label={`${code.length} of ${ADMIN_PIN.length} digits entered`}>
        {Array.from({length: ADMIN_PIN.length}, (_, i) => (
          <span key={i} className={`pin-pad__dot${i < code.length ? ' pin-pad__dot--on' : ''}`} />
        ))}
      </div>
      <p className={`pin-pad__error${wrong ? ' pin-pad__error--show' : ''}`} role="alert">
        {wrong ? 'Wrong code, try again' : ' '}
      </p>
      <div className="pin-pad__grid">
        {DIGITS.map((d) => (
          <button key={d} className="pin-pad__button" onClick={() => press(d)}>
            {d}
          </button>
        ))}
        {onBack ? (
          <button className="pin-pad__button pin-pad__button--soft" onClick={onBack} aria-label="Back">
            <Icon name="back" size={32} />
          </button>
        ) : (
          <span />
        )}
        <button className="pin-pad__button" onClick={() => press('0')}>
          0
        </button>
        <button
          className="pin-pad__button pin-pad__button--soft"
          onClick={() => setCode((c) => c.slice(0, -1))}
          aria-label="Delete last digit">
          <Icon name="backspace" size={32} />
        </button>
      </div>
    </div>
  );
}
