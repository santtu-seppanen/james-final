import {useState} from 'react';

interface Props {
  defaultName: string;
  onSave: (name: string) => void;
  onSkip: () => void;
}

export function SaveDrinkModal({defaultName, onSave, onSkip}: Props) {
  const [name, setName] = useState(defaultName);

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Save this drink?</h3>
        <p>Give your AI-generated drink a name to add it to the menu.</p>
        <input
          className="modal__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <div className="modal__actions">
          <button className="button button--primary" onClick={() => onSave(name.trim() || defaultName)}>
            Save
          </button>
          <button className="button" onClick={onSkip}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
