import {useState} from 'react';
import type {Bottle} from '../../types';
import {pourAdHoc} from '../../api';
import {bottleLevel} from '../../drinkColor';
import {features} from '../../features';
import {Icon} from '../Icon';

interface Props {
  bottles: Bottle[];
  servos: boolean[];
}

// Everything issue #10 asks for, laid out - but only "test pour" has a
// backend today (one shot via /drinkme). Open/close, flush, LED segment
// test, sound test and belt home wait for their endpoints and render
// disabled so the layout is settled when they arrive.
export function MaintenanceTab({bottles, servos}: Props) {
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  async function testPour(index: number) {
    const bottle = bottles[index];
    setBusy(index);
    setMessage('');
    try {
      const result = await pourAdHoc({friendlyname: `Test ${bottle.name}`, ingredients: [{name: bottle.name, serving: Number(bottle.serving)}]});
      setMessage(result.success ? `Pouring one shot of ${bottle.name}. Counts as a serving.` : result.error || 'Pour rejected');
      window.setTimeout(() => setBusy(null), result.success ? result.pourTime : 0);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Pour failed');
      setBusy(null);
    }
  }

  const todo = !features.maintenance;

  return (
    <div className="admin-tab">
      <div className="admin-tab__head">
        <h2>Maintenance</h2>
        {message && (
          <span className="save-status" role="status">
            {message}
          </span>
        )}
      </div>

      <h3>Servos</h3>
      <div className="maint-grid">
        {bottles.map((bottle, i) => {
          const level = bottleLevel(bottle);
          return (
            <div key={i} className={`maint-slot${servos[i] ? ' is-active' : ''}`}>
              <div className="maint-slot__head">
                <span className="maint-slot__slot">Slot {i + 1}</span>
                <span className="maint-slot__name">{level.isSlotUnused ? 'empty slot' : bottle.name}</span>
                <span className={`dot${servos[i] ? ' dot--on' : ''}`} aria-label={servos[i] ? 'open' : 'closed'} />
              </div>
              <div className="maint-slot__actions">
                <button className="button" disabled={todo} title={todo ? 'Needs a servo endpoint (issue #10)' : undefined}>
                  Open
                </button>
                <button className="button" disabled={todo} title={todo ? 'Needs a servo endpoint (issue #10)' : undefined}>
                  Close
                </button>
                <button className="button button--primary" disabled={level.isSlotUnused || level.isEmpty || busy !== null} onClick={() => testPour(i)}>
                  {busy === i ? 'Pouring…' : 'Test pour'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <h3>Programs</h3>
      <div className="maint-programs">
        <DisabledTool icon="refresh" label="Flush program" note="Runs every slot with water. Needs issue #10." />
        <DisabledTool icon="sun" label="LED segment test" note="Lights one slot at a time. Needs the LED strip (issue #1)." />
        <DisabledTool icon="music" label="Sound test" note="Plays each effect. Needs the speaker (issue #3)." />
        <DisabledTool icon="home" label="Belt home" note="Drives the belt to its home switch. No belt yet (issue #6)." />
      </div>
    </div>
  );
}

function DisabledTool({icon, label, note}: {icon: 'refresh' | 'sun' | 'music' | 'home'; label: string; note: string}) {
  return (
    <div className="tool tool--disabled">
      <button className="button button--lg" disabled>
        <Icon name={icon} /> {label}
      </button>
      <span className="tool__note">
        <Icon name="warning" size={16} /> Not connected. {note}
      </span>
    </div>
  );
}
