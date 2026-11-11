import type {KioskSettings} from '../../settings';
import {features} from '../../features';
import {Icon} from '../Icon';

interface Props {
  settings: KioskSettings;
  onChange: (patch: Partial<KioskSettings>) => void;
}

// Kiosk-local settings work now (localStorage). The LED / sound / show
// groups are the backend-side settings from the design prompt, rendered
// disabled until those subsystems exist - see src/features.ts.
export function SettingsTab({settings, onChange}: Props) {
  return (
    <div className="admin-tab">
      <div className="admin-tab__head">
        <h2>Settings</h2>
      </div>

      <div className="settings">
        <fieldset className="settings__group">
          <legend>Screen</legend>
          <Toggle
            label="Reduce motion"
            hint="No pulses, drifts or glows. Also follows the browser's own setting."
            checked={settings.reduceMotion}
            onChange={(reduceMotion) => onChange({reduceMotion})}
          />
          <Toggle
            label="Light theme in Admin"
            hint="Guests always get the dark theme."
            checked={settings.lightAdmin}
            onChange={(lightAdmin) => onChange({lightAdmin})}
          />
          <Stepper
            label="Idle screen after"
            unit="s"
            value={settings.idleSeconds}
            min={0}
            max={600}
            step={30}
            hint="0 turns the idle screen off."
            onChange={(idleSeconds) => onChange({idleSeconds})}
          />
          <Stepper
            label="Back to menu after a drink"
            unit="s"
            value={settings.doneSeconds}
            min={5}
            max={60}
            step={5}
            onChange={(doneSeconds) => onChange({doneSeconds})}
          />
        </fieldset>

        <fieldset className="settings__group" disabled={!features.leds}>
          <legend>
            Lights {!features.leds && <NotConnected issue="#1" />}
          </legend>
          <Stepper label="Brightness" unit="%" value={60} min={0} max={100} step={10} onChange={() => {}} />
          <Choice label="Idle scene" value="breathe" options={['breathe', 'hue cycle', 'off']} />
        </fieldset>

        <fieldset className="settings__group" disabled={!features.sound}>
          <legend>
            Sound {!features.sound && <NotConnected issue="#3" />}
          </legend>
          <Toggle label="Sound" checked={false} onChange={() => {}} />
          <Toggle label="Effects" checked={false} onChange={() => {}} />
          <Stepper label="Volume" unit="%" value={50} min={0} max={100} step={10} onChange={() => {}} />
        </fieldset>

        <fieldset className="settings__group" disabled={!features.show}>
          <legend>
            Show mode {!features.show && <NotConnected issue="#4" />}
          </legend>
          <Toggle label="Show mode" checked={false} onChange={() => {}} />
          <Stepper label="Default BPM" unit="" value={120} min={60} max={180} step={5} onChange={() => {}} />
          <div className="setting">
            <span className="setting__label">Tracks</span>
            <span className="field__hint">No music files. Drop MP3s and beat maps into the music folder on the Pi.</span>
          </div>
        </fieldset>

        <fieldset className="settings__group" disabled={!features.strength}>
          <legend>
            Strength {!features.strength && <NotConnected issue="#19" />}
          </legend>
          <Toggle label="Strength selector on confirm screen" checked={false} onChange={() => {}} />
          <Toggle label="Mocktail-only mode" hint="Alcohol bottles never pour." checked={false} onChange={() => {}} />
        </fieldset>
      </div>
    </div>
  );
}

function NotConnected({issue}: {issue: string}) {
  return (
    <span className="legend-note">
      <Icon name="warning" size={14} /> not connected ({issue})
    </span>
  );
}

function Toggle({label, hint, checked, onChange}: {label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void}) {
  return (
    <div className="setting">
      <span className="setting__label">
        {label}
        {hint && <span className="field__hint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`switch${checked ? ' is-on' : ''}`}
        onClick={() => onChange(!checked)}>
        <span className="switch__knob" />
        <span className="switch__text">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}

function Stepper({
  label,
  unit,
  value,
  min,
  max,
  step,
  hint,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="setting">
      <span className="setting__label">
        {label}
        {hint && <span className="field__hint">{hint}</span>}
      </span>
      <span className="stepper">
        <button type="button" className="button button--icon" onClick={() => onChange(Math.max(min, value - step))} aria-label={`Decrease ${label}`}>
          <Icon name="minus" />
        </button>
        <span className="stepper__value" aria-live="polite">
          {value}
          {unit}
        </span>
        <button type="button" className="button button--icon" onClick={() => onChange(Math.min(max, value + step))} aria-label={`Increase ${label}`}>
          <Icon name="plus" />
        </button>
      </span>
    </div>
  );
}

function Choice({label, value, options}: {label: string; value: string; options: string[]}) {
  return (
    <div className="setting">
      <span className="setting__label">{label}</span>
      <span className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={o === value} className={`segmented__option${o === value ? ' is-selected' : ''}`}>
            {o}
          </button>
        ))}
      </span>
    </div>
  );
}
