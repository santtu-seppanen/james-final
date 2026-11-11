const fs = require('fs');
const os = require('os');
const path = require('path');
const {createSyncClient} = require('./cloud-sync');

// A fake cloud: queue of responses per path, plus a record of requests.
function fakeCloud() {
  const calls = [];
  const queues = {};
  function respond(status, body, headers) {
    return {
      status,
      ok: status >= 200 && status < 300,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
      headers: {get: (k) => (headers || {})[k.toLowerCase()]},
    };
  }
  return {
    calls,
    on(pathname, ...responses) {
      queues[pathname] = (queues[pathname] || []).concat(responses);
    },
    fetch(url, init) {
      const pathname = new URL(url).pathname;
      calls.push({path: pathname, method: (init && init.method) || 'GET', headers: (init && init.headers) || {}, body: init && init.body ? JSON.parse(init.body) : null});
      const queue = queues[pathname] || [];
      const next = queue.length ? queue.shift() : null;
      if (!next) return Promise.reject(new Error('ECONNREFUSED ' + pathname));
      if (next instanceof Error) return Promise.reject(next);
      return Promise.resolve(respond(next.status, next.body));
    },
  };
}

function publishedConfig(version, overrides) {
  const config = Object.assign(
    {
      schemaVersion: 1,
      availableBottles: ['vodka', 'tonic', 'cranberry', 'empty'],
      bottles: [
        {name: 'vodka', serving: 25, capacity: 700},
        {name: 'tonic', serving: 50, capacity: 1000},
      ],
      recipes: {vodkatonic: {friendlyname: 'Vodka & Tonic', ingredients: [{name: 'vodka', serving: 50}, {name: 'tonic', serving: 100}], imageUrl: 'gin_tonic'}},
      settings: {led: {brightness: 40}},
    },
    overrides || {}
  );
  return {status: 200, body: {version, etag: '"v' + version + '-abc"', publishedAt: '2026-11-10T10:00:00Z', config}};
}

function metrics(drinksServed, alcohol, splits) {
  return {
    containers: [
      {title: 'James Bottles', controls: []},
      {
        title: 'James Drinks',
        controls: [{summaries: [{items: [{title: 'Drinks served:', value: drinksServed}, {title: 'Alcohol poured (ml):', value: alcohol}]}], metrics: splits || []}],
      },
    ],
  };
}

let dataDir;
let serverDir;
let cloud;
let clock;

function makeClient() {
  return createSyncClient({
    dataDir,
    serverDir,
    cloudUrl: 'https://cloud.test/',
    token: 'device-token',
    fetch: cloud.fetch,
    serverUrl: 'http://pi.test:8000',
    log: () => {},
    now: () => clock,
  });
}

function writeJson(name, value) {
  fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value));
}
function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
}

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'james-sync-'));
  serverDir = fs.mkdtempSync(path.join(os.tmpdir(), 'james-server-'));
  fs.writeFileSync(path.join(serverDir, 'VERSION'), 'abc1234\n');
  writeJson('bottles_config.json', [
    {name: 'vodka', serving: 25, capacity: 500, originalCapacity: 700},
    {name: 'empty', serving: 50, capacity: 1000, originalCapacity: 1000},
  ]);
  writeJson('recipes_config.json', {old: {friendlyname: 'Old drink', ingredients: [{name: 'vodka', serving: 25}], imageUrl: 'vodka'}});
  writeJson('available_bottles_config.json', ['vodka', 'empty']);
  writeJson('metrics.json', metrics(10, 500, [{title: 'Old drink', value: 10}]));
  cloud = fakeCloud();
  clock = Date.parse('2026-11-10T12:00:00Z');
});

afterEach(() => {
  fs.rmSync(dataDir, {recursive: true, force: true});
  fs.rmSync(serverDir, {recursive: true, force: true});
});

describe('config sync', () => {
  it('applies a new config: recipes/available/settings replaced, live bottle levels kept', async () => {
    cloud.on('/api/device/config', publishedConfig(3));
    cloud.on('/api/version', {status: 200, body: {version: 'abc1234'}});
    cloud.on('/api/device/stats', {status: 200, body: {ok: true, config: {version: 3, etag: '"v3-abc"'}}});

    const summary = await makeClient().runOnce();
    expect(summary).toEqual({applied: true, reported: true});

    expect(readJson('recipes_config.json')).toEqual({vodkatonic: {friendlyname: 'Vodka & Tonic', ingredients: [{name: 'vodka', serving: 50}, {name: 'tonic', serving: 100}], imageUrl: 'gin_tonic'}});
    expect(readJson('available_bottles_config.json')).toEqual(['vodka', 'tonic', 'cranberry', 'empty']);
    expect(readJson('settings.json').led).toEqual(expect.objectContaining({brightness: 40, enabled: true}));
    // Slot 0: same bottle, same size -> live level (500 of 700) untouched.
    // Slot 1: empty -> tonic = refilled, full.
    expect(readJson('bottles_config.json')).toEqual([
      {name: 'vodka', serving: 25, capacity: 500, originalCapacity: 700},
      {name: 'tonic', serving: 50, capacity: 1000, originalCapacity: 1000},
    ]);

    const stats = cloud.calls.find((c) => c.path === '/api/device/stats').body;
    expect(stats.appliedConfig).toEqual({version: 3, etag: '"v3-abc"', status: 'applied', error: null, at: '2026-11-10T12:00:00.000Z'});
    expect(stats.deviceVersion).toBe('abc1234');
    expect(stats.serverReachable).toBe(true);
    expect(stats.bottles[1]).toEqual({slot: 1, name: 'tonic', capacityMl: 1000, originalCapacityMl: 1000, servingMl: 50});
    expect(stats.recipes).toEqual([{id: 'vodkatonic', friendlyname: 'Vodka & Tonic', ingredients: expect.any(Array), imageUrl: 'gin_tonic'}]);
    expect(stats.counters).toEqual({drinksServed: 10, alcoholServedMl: 500});
    expect(cloud.calls[0].headers.authorization).toBe('Bearer device-token');
  });

  it('sends If-None-Match on the next cycle and does nothing on 304', async () => {
    cloud.on('/api/device/config', publishedConfig(3), {status: 304, body: null});
    cloud.on('/api/version', {status: 200, body: {version: 'abc1234'}}, {status: 200, body: {version: 'abc1234'}});
    cloud.on('/api/device/stats', {status: 200, body: {ok: true, config: {version: 3, etag: '"v3-abc"'}}}, {status: 200, body: {ok: true, config: {version: 3, etag: '"v3-abc"'}}});

    await makeClient().runOnce();
    const before = fs.statSync(path.join(dataDir, 'recipes_config.json')).mtimeMs;
    const second = await makeClient().runOnce(); // fresh client: state comes from the state file
    expect(second).toEqual({applied: false, reported: true});
    const configCalls = cloud.calls.filter((c) => c.path === '/api/device/config');
    expect(configCalls[0].headers['if-none-match']).toBeUndefined();
    expect(configCalls[1].headers['if-none-match']).toBe('"v3-abc"');
    expect(fs.statSync(path.join(dataDir, 'recipes_config.json')).mtimeMs).toBe(before);
  });

  it('rejects an invalid config, keeps the current files and reports why', async () => {
    const bad = publishedConfig(4, {bottles: [{name: 'gin', serving: 30, capacity: 1}]});
    cloud.on('/api/device/config', bad, {status: 304, body: null});
    cloud.on('/api/version', {status: 200, body: {version: 'x'}}, {status: 200, body: {version: 'x'}});
    cloud.on('/api/device/stats', {status: 200, body: {ok: true, config: {version: 4, etag: '"v4-abc"'}}}, {status: 200, body: {ok: true, config: {version: 4, etag: '"v4-abc"'}}});

    const summary = await makeClient().runOnce();
    expect(summary.applied).toBe(false);
    expect(readJson('recipes_config.json')).toEqual({old: expect.any(Object)});
    expect(readJson('available_bottles_config.json')).toEqual(['vodka', 'empty']);
    expect(fs.existsSync(path.join(dataDir, 'settings.json'))).toBe(false);

    const stats = cloud.calls.find((c) => c.path === '/api/device/stats').body;
    expect(stats.appliedConfig.status).toBe('rejected');
    expect(stats.appliedConfig.version).toBe(4);
    expect(stats.appliedConfig.error).toMatch(/bottles\[0\]\.name/);
    expect(stats.errors[0]).toEqual(expect.objectContaining({source: 'config'}));

    // The bad version is not downloaded again every minute
    await makeClient().runOnce();
    expect(cloud.calls.filter((c) => c.path === '/api/device/config')[1].headers['if-none-match']).toBe('"v4-abc"');
  });

  it('treats a new refilledAt stamp as a refill, once', async () => {
    const withRefill = publishedConfig(5, {bottles: [{name: 'vodka', serving: 25, capacity: 700, refilledAt: '2026-11-10T11:00:00Z'}, {name: 'empty', serving: 50, capacity: 1000}]});
    cloud.on('/api/device/config', withRefill, {status: 304, body: null});
    cloud.on('/api/version', {status: 200, body: {}}, {status: 200, body: {}});
    cloud.on('/api/device/stats', {status: 200, body: {ok: true}}, {status: 200, body: {ok: true}});

    await makeClient().runOnce();
    expect(readJson('bottles_config.json')[0]).toEqual({name: 'vodka', serving: 25, capacity: 700, originalCapacity: 700});

    // Someone pours; the next 304 cycle must not refill again
    writeJson('bottles_config.json', [{name: 'vodka', serving: 25, capacity: 650, originalCapacity: 700}, {name: 'empty', serving: 50, capacity: 1000, originalCapacity: 1000}]);
    await makeClient().runOnce();
    expect(readJson('bottles_config.json')[0].capacity).toBe(650);

    // Re-applying the same stamp (e.g. a rollback carrying the old refilledAt) is not a refill either
    cloud.on('/api/device/config', Object.assign({}, withRefill, {body: Object.assign({}, withRefill.body, {version: 6, etag: '"v6-abc"'})}));
    cloud.on('/api/version', {status: 200, body: {}});
    cloud.on('/api/device/stats', {status: 200, body: {ok: true}});
    await makeClient().runOnce();
    expect(readJson('bottles_config.json')[0].capacity).toBe(650);
  });

  it('fetches again when the stats reply names a newer version', async () => {
    cloud.on('/api/device/config', {status: 304, body: null}, publishedConfig(7));
    cloud.on('/api/version', {status: 200, body: {}});
    cloud.on('/api/device/stats', {status: 200, body: {ok: true, config: {version: 7, etag: '"v7-abc"'}}});

    const summary = await makeClient().runOnce();
    expect(summary.applied).toBe(true);
    expect(cloud.calls.filter((c) => c.path === '/api/device/config').length).toBe(2);
    expect(readJson('recipes_config.json').vodkatonic).toBeDefined();
  });

  it('does nothing without a published config (404)', async () => {
    cloud.on('/api/device/config', {status: 404, body: {error: 'no config published yet'}});
    cloud.on('/api/version', {status: 200, body: {}});
    cloud.on('/api/device/stats', {status: 200, body: {ok: true, config: null}});
    const summary = await makeClient().runOnce();
    expect(summary).toEqual({applied: false, reported: true});
    expect(readJson('recipes_config.json').old).toBeDefined();
  });
});

describe('offline behaviour', () => {
  it('leaves files alone, backs off exponentially and resumes', async () => {
    // Nothing queued -> every cloud call is refused
    cloud.on('/api/version', {status: 200, body: {}}, {status: 200, body: {}}, {status: 200, body: {}});
    const client = makeClient();
    const first = await client.runOnce();
    expect(first.error).toMatch(/ECONNREFUSED/);
    expect(readJson('recipes_config.json').old).toBeDefined();
    expect(client.getState().failures).toBe(1);
    expect(client.getState().nextAttemptAt).toBe(clock + 30000);

    // Within the backoff window a cron run is a no-op (no network at all)
    clock += 10000;
    const callsBefore = cloud.calls.length;
    expect(await makeClient().runOnce()).toEqual({skipped: true, backoffUntil: clock - 10000 + 30000});
    expect(cloud.calls.length).toBe(callsBefore);

    // Second failure doubles the wait
    clock += 30000;
    const client2 = makeClient();
    await client2.runOnce();
    expect(client2.getState().failures).toBe(2);
    expect(client2.getState().nextAttemptAt).toBe(clock + 60000);

    // Cloud is back: resets the backoff
    clock += 60000;
    cloud.on('/api/device/config', {status: 304, body: null});
    cloud.on('/api/device/stats', {status: 200, body: {ok: true}});
    const client3 = makeClient();
    const ok = await client3.runOnce();
    expect(ok.reported).toBe(true);
    expect(client3.getState().failures).toBe(0);
    expect(client3.getState().nextAttemptAt).toBeNull();
  });

  it('reports the drink server as unreachable but still reports', async () => {
    cloud.on('/api/device/config', {status: 304, body: null});
    cloud.on('/api/device/stats', {status: 200, body: {ok: true}});
    await makeClient().runOnce();
    const stats = cloud.calls.find((c) => c.path === '/api/device/stats').body;
    expect(stats.serverReachable).toBe(false);
    expect(stats.deviceVersion).toBe('abc1234');
  });

  it('skips silently when not configured', async () => {
    const client = createSyncClient({dataDir, serverDir, cloudUrl: '', token: '', fetch: cloud.fetch, log: () => {}});
    expect(await client.runOnce()).toEqual({skipped: true});
    expect(cloud.calls.length).toBe(0);
  });
});

describe('stats', () => {
  function cycle(n) {
    for (let i = 0; i < n; i++) {
      cloud.on('/api/device/config', {status: 304, body: null});
      cloud.on('/api/version', {status: 200, body: {}});
      cloud.on('/api/device/stats', {status: 200, body: {ok: true}});
    }
  }
  function lastStats() {
    return cloud.calls.filter((c) => c.path === '/api/device/stats').pop().body;
  }

  it('counts pours per bottle from capacity decreases, ignoring refills', async () => {
    cycle(3);
    await makeClient().runOnce();
    writeJson('bottles_config.json', [{name: 'vodka', serving: 25, capacity: 450, originalCapacity: 700}, {name: 'empty', serving: 50, capacity: 1000, originalCapacity: 1000}]);
    await makeClient().runOnce();
    expect(lastStats().bottleCounters).toEqual({vodka: {pours: 2, ml: 50}});
    // Refill (capacity up) and a swap are not pours
    writeJson('bottles_config.json', [{name: 'vodka', serving: 25, capacity: 700, originalCapacity: 700}, {name: 'tonic', serving: 50, capacity: 900, originalCapacity: 1000}]);
    await makeClient().runOnce();
    expect(lastStats().bottleCounters).toEqual({vodka: {pours: 2, ml: 50}});
  });

  it('derives pours from metrics.json deltas when there is no pours.jsonl', async () => {
    cycle(3);
    await makeClient().runOnce();
    expect(lastStats().pours).toEqual([]); // first cycle only sets the baseline
    writeJson('metrics.json', metrics(12, 550, [{title: 'Old drink', value: 12}]));
    await makeClient().runOnce();
    expect(lastStats().pours).toEqual([
      {recipeId: 'old', friendlyName: 'Old drink', alcoholMl: 25, pouredAt: '2026-11-10T12:00:00.000Z'},
      {recipeId: 'old', friendlyName: 'Old drink', alcoholMl: 25, pouredAt: '2026-11-10T12:00:00.000Z'},
    ]);
    // Backend restart resets the in-memory counters: no phantom pours
    writeJson('metrics.json', metrics(1, 25, [{title: 'Old drink', value: 1}]));
    await makeClient().runOnce();
    expect(lastStats().pours).toEqual([]);
  });

  it('prefers pours.jsonl and only reports new lines', async () => {
    cycle(3);
    const file = path.join(dataDir, 'pours.jsonl');
    fs.writeFileSync(file, JSON.stringify({ts: '2026-11-10T11:30:00Z', recipeId: 'old', friendlyname: 'Old drink', alcoholMl: 25}) + '\n');
    await makeClient().runOnce();
    expect(lastStats().pours).toEqual([{recipeId: 'old', friendlyName: 'Old drink', alcoholMl: 25, ingredients: null, pouredAt: '2026-11-10T11:30:00Z'}]);
    fs.appendFileSync(file, JSON.stringify({ts: '2026-11-10T11:45:00Z', recipeId: 'x', friendlyname: 'X', alcoholMl: 50, ingredients: [{name: 'vodka', ml: 50}]}) + '\n' + '{"partial":');
    await makeClient().runOnce();
    expect(lastStats().pours).toEqual([{recipeId: 'x', friendlyName: 'X', alcoholMl: 50, ingredients: [{name: 'vodka', ml: 50}], pouredAt: '2026-11-10T11:45:00Z'}]);
    await makeClient().runOnce();
    expect(lastStats().pours).toEqual([]);
  });
});
