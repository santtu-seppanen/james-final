import {useState} from 'react';
import type {Bottle, Recipe} from '../../types';
import {bottleLevel} from '../../drinkColor';
import {clearStats, consumptionSince, daysUntilEmpty, poursSince, tonightStart, topDrinks} from '../../stats';
import {Icon} from '../Icon';

interface Props {
  bottles: Bottle[];
  recipes: Recipe[];
}

// Counted on this kiosk only (src/stats.ts) until issue #15 serves
// metrics from the backend. Bottle consumption comes from the live
// bottle levels, which *are* server-side.
export function StatsTab({bottles}: Props) {
  const [range, setRange] = useState<'tonight' | 'week' | 'all'>('tonight');
  // Snapshot of "now", refreshed on every interaction, so render stays pure.
  const [now, setNow] = useState(() => Date.now());
  const refresh = () => setNow(Date.now());

  const since = range === 'tonight' ? tonightStart(now) : range === 'week' ? now - 7 * 24 * 3600 * 1000 : 0;
  const pours = poursSince(since);
  const top = topDrinks(since, 10);
  const used = consumptionSince(since);
  const maxCount = top.length > 0 ? top[0].count : 1;

  return (
    <div className="admin-tab">
      <div className="admin-tab__head">
        <h2>Stats</h2>
        <div className="admin-tab__head-actions">
          <span className="segmented" role="radiogroup" aria-label="Range">
            {(['tonight', 'week', 'all'] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={range === r}
                className={`segmented__option${range === r ? ' is-selected' : ''}`}
                onClick={() => {
                  setRange(r);
                  refresh();
                }}>
                {r === 'tonight' ? 'Tonight' : r === 'week' ? '7 days' : 'All'}
              </button>
            ))}
          </span>
          <button
            className="button button--danger-ghost"
            onClick={() => {
              if (window.confirm('Clear the drink counts on this kiosk?')) {
                clearStats();
                refresh();
              }
            }}>
            Clear
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="stat-tiles">
          <div className="stat-tile">
            <span className="stat-tile__value">{pours.length}</span>
            <span className="stat-tile__label">drinks served</span>
          </div>
          <div className="stat-tile">
            <span className="stat-tile__value">{Object.values(used).reduce((a, b) => a + b, 0)}</span>
            <span className="stat-tile__label">ml poured</span>
          </div>
          <div className="stat-tile">
            <span className="stat-tile__value">{bottles.filter((b) => bottleLevel(b).isLow || (bottleLevel(b).isEmpty && !bottleLevel(b).isSlotUnused)).length}</span>
            <span className="stat-tile__label">bottles low or empty</span>
          </div>
        </div>

        <div className="stats__cols">
          <section>
            <h3>Top drinks</h3>
            {top.length === 0 ? (
              <p className="field__hint">Nothing poured from this screen yet.</p>
            ) : (
              <ol className="bars">
                {top.map((t) => (
                  <li key={t.friendlyname}>
                    <span className="bars__label">{t.friendlyname}</span>
                    <span className="bars__track" aria-hidden="true">
                      <span style={{width: `${(t.count / maxCount) * 100}%`}} />
                    </span>
                    <span className="bars__value">{t.count}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section>
            <h3>Bottles</h3>
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Slot</th>
                  <th>Bottle</th>
                  <th>Left</th>
                  <th>Used</th>
                  <th>Days left</th>
                </tr>
              </thead>
              <tbody>
                {bottles.map((b, i) => {
                  const level = bottleLevel(b);
                  const days = daysUntilEmpty(b);
                  return (
                    <tr key={i} className={level.isSlotUnused ? 'is-muted' : ''}>
                      <td>{i + 1}</td>
                      <td>{level.isSlotUnused ? '—' : b.name}</td>
                      <td>
                        {level.isSlotUnused ? '' : `${Math.round(Number(b.capacity))} ml`}
                        {level.isLow && (
                          <span className="text-warn">
                            {' '}
                            <Icon name="warning" size={14} /> low
                          </span>
                        )}
                      </td>
                      <td>{used[b.name] ? `${used[b.name]} ml` : ''}</td>
                      <td>{days === null ? '' : days > 99 ? '99+' : days}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="field__hint">Counts are from this kiosk only; the public dashboard has the full picture.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
