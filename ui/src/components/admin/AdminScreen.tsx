import {useState} from 'react';
import type {Bottle, Recipe} from '../../types';
import type {KioskSettings} from '../../settings';
import {Icon, type IconName} from '../Icon';
import {PinPad} from '../PinPad';
import {BottlesTab} from './BottlesTab';
import {RecipesTab} from './RecipesTab';
import {MaintenanceTab} from './MaintenanceTab';
import {SettingsTab} from './SettingsTab';
import {StatsTab} from './StatsTab';

type Tab = 'bottles' | 'recipes' | 'maintenance' | 'settings' | 'stats';

const TABS: {id: Tab; label: string; icon: IconName}[] = [
  {id: 'bottles', label: 'Bottles', icon: 'bottle'},
  {id: 'recipes', label: 'Recipes', icon: 'edit'},
  {id: 'maintenance', label: 'Maintenance', icon: 'wrench'},
  {id: 'settings', label: 'Settings', icon: 'cog'},
  {id: 'stats', label: 'Stats', icon: 'chart'},
];

interface Props {
  bottles: Bottle[];
  recipes: Recipe[];
  servos: boolean[];
  settings: KioskSettings;
  onSettings: (patch: Partial<KioskSettings>) => void;
  onBack: () => void;
}

// PIN-gated admin. The PIN only gates on the client (see src/config.ts).
// Optional light theme here only (prompt: "light variant only for the
// admin screens if useful") - guests never see it.
export function AdminScreen({bottles, recipes, servos, settings, onSettings, onBack}: Props) {
  const [authorised, setAuthorised] = useState(false);
  const [tab, setTab] = useState<Tab>('bottles');

  if (!authorised) {
    return (
      <div className="screen screen--center">
        <PinPad title="Admin" onAuthorised={() => setAuthorised(true)} onBack={onBack} />
      </div>
    );
  }

  return (
    <div className="admin" data-theme={settings.lightAdmin ? 'light' : undefined}>
      <nav className="admin__tabs" aria-label="Admin sections">
        <button className="admin__exit" onClick={onBack} aria-label="Exit admin, back to menu">
          <Icon name="back" size={28} /> Exit
        </button>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`admin__tab${tab === t.id ? ' is-selected' : ''}`}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}>
            <Icon name={t.icon} size={22} /> {t.label}
          </button>
        ))}
      </nav>

      <section className="admin__panel">
        {tab === 'bottles' && <BottlesTab />}
        {tab === 'recipes' && <RecipesTab />}
        {tab === 'maintenance' && <MaintenanceTab bottles={bottles} servos={servos} />}
        {tab === 'settings' && <SettingsTab settings={settings} onChange={onSettings} />}
        {tab === 'stats' && <StatsTab bottles={bottles} recipes={recipes} />}
      </section>
    </div>
  );
}
