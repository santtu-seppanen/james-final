import {useState} from 'react';
import {Icon} from './Icon';

// The kiosk Chromium has no OS keyboard, so the one optional text field
// (naming an AI drink, admin recipe names) gets this. Deliberately plain:
// letters, digits, space, backspace. Keys are 1 cm+ at the panel's density.
const ROWS = ['1234567890', 'qwertyuiopå', 'asdfghjklöä', 'zxcvbnm-&'];

interface Props {
  value: string;
  onChange: (value: string) => void;
  onDone?: () => void;
  doneLabel?: string;
}

export function Keyboard({value, onChange, onDone, doneLabel = 'Done'}: Props) {
  const [upper, setUpper] = useState(value.length === 0);

  function type(ch: string) {
    onChange(value + (upper ? ch.toUpperCase() : ch));
    // Auto-capitalise just the first letter of each word, like a phone.
    if (upper) setUpper(false);
  }

  function backspace() {
    onChange(value.slice(0, -1));
  }

  function space() {
    onChange(value + ' ');
    setUpper(true);
  }

  return (
    <div className="keyboard" role="group" aria-label="On-screen keyboard">
      {ROWS.map((row) => (
        <div className="keyboard__row" key={row}>
          {row.split('').map((ch) => (
            <button key={ch} type="button" className="key" onClick={() => type(ch)}>
              {upper ? ch.toUpperCase() : ch}
            </button>
          ))}
        </div>
      ))}
      <div className="keyboard__row">
        <button
          type="button"
          className={`key key--wide${upper ? ' key--on' : ''}`}
          onClick={() => setUpper((u) => !u)}
          aria-pressed={upper}
          aria-label="Shift">
          ⇧
        </button>
        <button type="button" className="key key--space" onClick={space} aria-label="Space">
          space
        </button>
        <button type="button" className="key key--wide" onClick={backspace} aria-label="Backspace">
          <Icon name="backspace" />
        </button>
        {onDone && (
          <button type="button" className="key key--wide key--done" onClick={onDone}>
            {doneLabel}
          </button>
        )}
      </div>
    </div>
  );
}
