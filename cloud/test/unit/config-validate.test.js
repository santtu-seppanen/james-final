import {test} from 'node:test';
import assert from 'node:assert/strict';
import validate from '../../shared/config-validate.js';
import settingsSchema from '../../shared/settings-schema.js';

const {validateConfig, canonicalJson} = validate;

function goodConfig() {
  return {
    schemaVersion: 1,
    availableBottles: ['vodka', 'tonic', 'cranberry', 'empty'],
    bottles: [
      {name: 'vodka', serving: 25, capacity: 700},
      {name: 'tonic', serving: 50, capacity: 1000},
      {name: 'empty', serving: 50, capacity: 1000},
    ],
    recipes: {
      vodkatonic: {friendlyname: 'Vodka & Tonic', ingredients: [{name: 'Vodka', serving: 50}, {name: 'tonic', serving: 100}], imageUrl: 'gin_tonic'},
      moukku: {friendlyname: 'Moukku', ingredients: [{name: 'vodka', serving: 50}, {name: 'lemonade', serving: 120, manual: true}]},
    },
    settings: {led: {brightness: 50}},
  };
}

test('accepts a valid config and normalizes it', () => {
  const result = validateConfig(goodConfig());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const {config} = result;
  // Ingredient name takes the availableBottles casing
  assert.equal(config.recipes.vodkatonic.ingredients[0].name, 'vodka');
  assert.equal(config.recipes.moukku.ingredients[1].manual, true);
  // Settings are filled in with defaults, given values kept
  assert.equal(config.settings.led.brightness, 50);
  assert.equal(config.settings.led.enabled, true);
  assert.equal(config.settings.audio.volume, settingsSchema.defaults().audio.volume);
  assert.equal(config.schemaVersion, 1);
});

test('rejects bottles not in availableBottles and bad servings', () => {
  const cfg = goodConfig();
  cfg.bottles[0].name = 'rum';
  cfg.bottles[1].serving = 30;
  cfg.bottles[2].capacity = 99999;
  const result = validateConfig(cfg);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /bottles\[0\]\.name/);
  assert.match(result.errors.join('\n'), /bottles\[1\]\.serving/);
  assert.match(result.errors.join('\n'), /bottles\[2\]\.capacity/);
});

test('rejects recipe ingredients that are not a multiple of the loaded bottle pour size', () => {
  const cfg = goodConfig();
  cfg.recipes.vodkatonic.ingredients[0].serving = 30;
  const result = validateConfig(cfg);
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /multiple of 25/);
});

test('allows recipes for available-but-unloaded bottles (hidden on the kiosk until loaded)', () => {
  const cfg = goodConfig();
  cfg.recipes.cran = {friendlyname: 'Cran', ingredients: [{name: 'cranberry', serving: 33}]};
  assert.equal(validateConfig(cfg).ok, true);
});

test('rejects unknown non-manual ingredients, duplicates and bad ids', () => {
  const cfg = goodConfig();
  cfg.recipes['bad id!'] = {friendlyname: 'X', ingredients: [{name: 'vodka', serving: 25}]};
  cfg.recipes.dup = {friendlyname: 'Dup', ingredients: [{name: 'vodka', serving: 25}, {name: 'VODKA', serving: 25}]};
  cfg.recipes.unknown = {friendlyname: 'U', ingredients: [{name: 'gin', serving: 25}]};
  const result = validateConfig(cfg);
  assert.equal(result.ok, false);
  const text = result.errors.join('\n');
  assert.match(text, /bad id!/);
  assert.match(text, /duplicate ingredient/);
  assert.match(text, /"gin" is not in availableBottles/);
});

test('validates settings against the schema but preserves unknown keys', () => {
  const cfg = goodConfig();
  cfg.settings = {led: {brightness: 500}, audio: {volume: 'loud'}, show: {bpm: 120, extraFromPi: 'kept'}, belt: {speed: 3}};
  const result = validateConfig(cfg);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /settings\.led\.brightness/);
  assert.match(result.errors.join('\n'), /settings\.audio\.volume/);

  cfg.settings = {show: {bpm: 120, extraFromPi: 'kept'}, belt: {speed: 3}};
  const ok = validateConfig(cfg);
  assert.equal(ok.ok, true);
  assert.equal(ok.config.settings.show.extraFromPi, 'kept');
  assert.deepEqual(ok.config.settings.belt, {speed: 3});
});

test('refilledAt must be a date', () => {
  const cfg = goodConfig();
  cfg.bottles[0].refilledAt = 'yesterday';
  assert.equal(validateConfig(cfg).ok, false);
  cfg.bottles[0].refilledAt = '2026-11-10T12:00:00.000Z';
  const ok = validateConfig(cfg);
  assert.equal(ok.ok, true);
  assert.equal(ok.config.bottles[0].refilledAt, '2026-11-10T12:00:00.000Z');
});

test('rejects garbage', () => {
  assert.equal(validateConfig(null).ok, false);
  assert.equal(validateConfig([]).ok, false);
  assert.equal(validateConfig({}).ok, false);
  assert.equal(validateConfig({...goodConfig(), schemaVersion: 2}).ok, false);
});

test('canonicalJson is key-order independent', () => {
  assert.equal(canonicalJson({b: 1, a: [{d: 1, c: 2}]}), canonicalJson({a: [{c: 2, d: 1}], b: 1}));
  assert.equal(canonicalJson({a: undefined, b: 1}), '{"b":1}');
});

test('refuses __proto__ keys, URL-ish image names and path-like track names', () => {
  const proto = goodConfig();
  proto.recipes = JSON.parse('{"__proto__": {"friendlyname": "x", "ingredients": [{"name": "vodka", "serving": 25}]}}');
  assert.equal(validateConfig(proto).ok, false);

  const protoSettings = goodConfig();
  protoSettings.settings = JSON.parse('{"__proto__": {"polluted": true}}');
  assert.equal(validateConfig(protoSettings).ok, false);
  const protoField = goodConfig();
  protoField.settings = JSON.parse('{"led": {"__proto__": {"polluted": true}}}');
  assert.equal(validateConfig(protoField).ok, false);
  assert.equal({}.polluted, undefined);

  const image = goodConfig();
  image.recipes.vodkatonic.imageUrl = 'javascript:alert(1)';
  assert.match(validateConfig(image).errors[0], /imageUrl/);

  for (const track of ['../../etc/passwd', '/etc/passwd', 'a/b.mp3', '.hidden']) {
    const bad = goodConfig();
    bad.settings.show = {track};
    assert.equal(validateConfig(bad).ok, false, track);
  }
  const fine = goodConfig();
  fine.settings.show = {track: 'Darude - Sandstorm (radio edit).mp3'};
  assert.equal(validateConfig(fine).ok, true);
});
