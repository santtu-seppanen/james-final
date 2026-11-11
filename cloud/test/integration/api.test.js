import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {startWorker, client, sampleConfig, DEVICE_TOKEN, ADMIN_TOKEN} from './helpers.js';

let worker;
let admin;
let device;
let anon;

before(async () => {
  worker = await startWorker();
  admin = client(worker.base, ADMIN_TOKEN);
  device = client(worker.base, DEVICE_TOKEN);
  anon = client(worker.base, null);
});

after(async () => {
  if (worker) await worker.stop();
});

test('health is public, everything else needs the right token', async () => {
  assert.equal((await anon('GET', '/api/health')).status, 200);
  assert.equal((await anon('GET', '/api/admin/overview')).status, 401);
  assert.equal((await anon('GET', '/api/device/config')).status, 401);
  // The device token is not an admin token and vice versa
  assert.equal((await device('GET', '/api/admin/overview')).status, 401);
  assert.equal((await admin('GET', '/api/device/config')).status, 401);
  assert.equal((await client(worker.base, 'wrong')('GET', '/api/admin/overview')).status, 401);
  assert.equal((await admin('GET', '/api/admin/nope')).status, 404);
  // Empty / malformed bearers never match, and nothing is exposed cross-origin
  assert.equal((await client(worker.base, '')('GET', '/api/admin/overview', undefined, {authorization: 'Bearer '})).status, 401);
  assert.equal((await client(worker.base, null)('GET', '/api/admin/overview', undefined, {authorization: ADMIN_TOKEN})).status, 401);
  assert.equal((await client(worker.base, ADMIN_TOKEN + 'x')('GET', '/api/admin/overview')).status, 401);
  const res = await admin('GET', '/api/admin/overview', undefined, {origin: 'https://evil.example'});
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await admin('GET', '/api/admin/config/versions/99999999999999999999')).status, 404);
});

test('the config UI is served with a strict CSP and cannot be framed', async () => {
  const page = await anon('GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.text, /James config/);
  assert.match(page.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.match(page.headers.get('content-security-policy') || '', /script-src 'self'/);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.notEqual((await anon('GET', '/_headers')).status, 200);
});

test('empty state: no config yet, no device', async () => {
  const overview = await admin('GET', '/api/admin/overview');
  assert.equal(overview.status, 200);
  assert.equal(overview.body.config, null);
  assert.equal(overview.body.device, null);
  assert.equal(overview.body.pending, false);
  assert.equal((await device('GET', '/api/device/config')).status, 404);
  assert.equal((await admin('GET', '/api/admin/config')).status, 404);
});

test('publishing validates, versions monotonically and serves ETags to the device', async () => {
  const bad = await admin('PUT', '/api/admin/config', {config: {...sampleConfig(), bottles: [{name: 'gin', serving: 25, capacity: 1}]}});
  assert.equal(bad.status, 400);
  assert.match(bad.body.errors[0], /bottles\[0\]\.name/);

  const v1 = await admin('PUT', '/api/admin/config', {config: sampleConfig(), note: 'first'});
  assert.equal(v1.status, 201, v1.text);
  assert.equal(v1.body.version, 1);
  assert.match(v1.body.etag, /^"v1-[0-9a-f]{16}"$/);
  // Settings came back defaulted
  assert.equal(v1.body.config.settings.led.brightness, 60);
  assert.equal(v1.body.config.settings.audio.enabled, true);

  // Same content again -> no new version
  const same = await admin('PUT', '/api/admin/config', {config: sampleConfig()});
  assert.equal(same.status, 200);
  assert.equal(same.body.unchanged, true);
  assert.equal(same.body.version, 1);

  // Device fetch: 200 with ETag, then 304 with If-None-Match
  const fetched = await device('GET', '/api/device/config');
  assert.equal(fetched.status, 200);
  assert.equal(fetched.headers.get('etag'), v1.body.etag);
  assert.equal(fetched.body.version, 1);
  assert.equal(fetched.body.config.bottles[0].name, 'vodka');
  const notModified = await device('GET', '/api/device/config', undefined, {'if-none-match': v1.body.etag});
  assert.equal(notModified.status, 304);

  // Stale baseVersion -> 409
  const changed = sampleConfig();
  changed.settings.led.brightness = 10;
  const v2 = await admin('PUT', '/api/admin/config', {config: changed, baseVersion: 1, note: 'dimmer'});
  assert.equal(v2.status, 201);
  assert.equal(v2.body.version, 2);
  const conflict = await admin('PUT', '/api/admin/config', {config: sampleConfig(), baseVersion: 1});
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.currentVersion, 2);

  // Old ETag is now stale -> 200 with the new one
  const refetched = await device('GET', '/api/device/config', undefined, {'if-none-match': v1.body.etag});
  assert.equal(refetched.status, 200);
  assert.equal(refetched.body.version, 2);
});

test('version history and rollback', async () => {
  const list = await admin('GET', '/api/admin/config/versions');
  assert.equal(list.status, 200);
  assert.deepEqual(
    list.body.versions.map((v) => [v.version, v.note]),
    [
      [2, 'dimmer'],
      [1, 'first'],
    ],
  );

  const one = await admin('GET', '/api/admin/config/versions/1');
  assert.equal(one.status, 200);
  assert.equal(one.body.config.settings.led.brightness, 60);
  assert.equal((await admin('GET', '/api/admin/config/versions/99')).status, 404);

  const rb = await admin('POST', '/api/admin/config/rollback', {version: 1});
  assert.equal(rb.status, 201, rb.text);
  assert.equal(rb.body.version, 3);
  assert.equal(rb.body.rolledBackFrom, 1);
  const current = await admin('GET', '/api/admin/config');
  assert.equal(current.body.version, 3);
  assert.equal(current.body.config.settings.led.brightness, 60);
  assert.equal(current.body.note, 'Rollback to v1');
  // Rollback to the same body as v1 still makes a new version with a new ETag
  assert.notEqual(current.body.etag, one.body.etag);
});

test('device stats ingest, overview and stats', async () => {
  const report = {
    deviceVersion: 'abc1234',
    uptimeS: 3600,
    serverReachable: true,
    appliedConfig: {version: 2, etag: '"v2-stale"', status: 'applied', at: '2026-11-10T10:00:00.000Z'},
    bottles: [
      {slot: 0, name: 'vodka', capacityMl: 650, originalCapacityMl: 700, servingMl: 25},
      {slot: 1, name: 'tonic', capacityMl: 900, originalCapacityMl: 1000, servingMl: 50},
    ],
    recipes: [{id: 'vodkatonic', friendlyname: 'Vodka & Tonic', ingredients: [{name: 'vodka', serving: 50}]}],
    availableBottles: ['vodka', 'tonic'],
    counters: {drinksServed: 12, alcoholServedMl: 600},
    bottleCounters: {vodka: {pours: 2, ml: 50}, tonic: {pours: 2, ml: 100}},
    pours: [
      {recipeId: 'vodkatonic', friendlyName: 'Vodka & Tonic', alcoholMl: 50, pouredAt: '2026-11-10T09:59:00.000Z'},
      {recipeId: 'vodkatonic', friendlyName: 'Vodka & Tonic', alcoholMl: 50},
    ],
    errors: [{at: '2026-11-10T09:00:00.000Z', source: 'sync', message: 'something'}],
    system: {hostname: 'james', model: 'Raspberry Pi 3'},
  };
  const res = await device('POST', '/api/device/stats', report);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.ok, true);
  // The response tells the device the current version (3, after the rollback)
  assert.equal(res.body.config.version, 3);

  const overview = await admin('GET', '/api/admin/overview');
  assert.equal(overview.body.device.online, true);
  assert.equal(overview.body.device.uptimeS, 3600);
  assert.equal(overview.body.device.deviceVersion, 'abc1234');
  assert.equal(overview.body.device.appliedConfig.version, 2);
  assert.equal(overview.body.device.bottles[0].capacityMl, 650);
  assert.equal(overview.body.device.counters.drinksServed, 12);
  assert.equal(overview.body.device.errors.length, 1);
  assert.equal(overview.body.device.system.model, 'Raspberry Pi 3');
  assert.equal(overview.body.config.version, 3);
  // Device applied v2, current is v3 -> pending
  assert.equal(overview.body.pending, true);

  const current = await admin('GET', '/api/admin/config');
  const ack = await device('POST', '/api/device/stats', {...report, appliedConfig: {version: 3, etag: current.body.etag, status: 'applied'}, pours: []});
  assert.equal(ack.status, 200);
  assert.equal((await admin('GET', '/api/admin/overview')).body.pending, false);

  const stats = await admin('GET', '/api/admin/stats?hours=24000');
  assert.equal(stats.status, 200, stats.text);
  assert.equal(stats.body.pours.length, 2);
  assert.deepEqual(stats.body.perRecipe, [{name: 'Vodka & Tonic', count: 2, alcoholMl: 100}]);
  assert.equal(stats.body.bottleCounters.vodka.pours, 2);
  assert.equal(stats.body.history.length, 1, 'history is sampled at most every 5 min');
  assert.equal(stats.body.history[0].drinksServed, 12);

  assert.equal((await device('POST', '/api/device/stats', undefined, {'content-type': 'application/json'})).status, 400);
});

test('schema endpoint describes the settings form', async () => {
  const res = await admin('GET', '/api/admin/schema');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.servings, [25, 50]);
  assert.ok(res.body.settings.some((s) => s.key === 'led'));
  assert.equal(res.body.settingsDefaults.show.enabled, false);
});
