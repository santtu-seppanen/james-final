// Schema for the free-form "settings" part of the device config (LED, audio,
// show mode, effects). The config UI renders its Settings tab from this, the
// Worker validates against it, and the Pi gets a fully defaulted copy in
// JAMES_DATA_DIR/settings.json (see server/cloud-sync.js).
//
// To add a setting: add a field here. Sections/fields the schema doesn't know
// about are preserved as-is (so the Pi side can lead), but only known fields
// get validation, defaults and a form control.
//
// Shared between the Worker (bundled by wrangler) and the Pi (Node 10) -
// plain CommonJS, no modern syntax on purpose.

var SECTIONS = [
  {
    key: 'led',
    title: 'LED lights',
    description: 'Addressable LED strip (bottle segments, belt, coaster).',
    fields: [
      {key: 'enabled', type: 'boolean', label: 'Enabled', default: true},
      {key: 'brightness', type: 'number', label: 'Brightness (%)', min: 0, max: 100, step: 1, default: 80},
      {
        key: 'idleScene',
        type: 'enum',
        label: 'Idle scene',
        options: ['off', 'breathe', 'hue-cycle'],
        default: 'breathe',
      },
      {key: 'fps', type: 'number', label: 'Frame rate', min: 5, max: 60, step: 1, default: 30},
    ],
  },
  {
    key: 'audio',
    title: 'Sound',
    description: 'Sound effects for taps, pours and errors.',
    fields: [
      {key: 'enabled', type: 'boolean', label: 'Enabled', default: true},
      {key: 'effects', type: 'boolean', label: 'Effect sounds (tap, pour, done)', default: true},
      {key: 'volume', type: 'number', label: 'Volume (%)', min: 0, max: 100, step: 1, default: 70},
    ],
  },
  {
    key: 'show',
    title: 'Show mode',
    description: 'Music + lights choreography while pouring.',
    fields: [
      {key: 'enabled', type: 'boolean', label: 'Enabled', default: false},
      {key: 'bpm', type: 'number', label: 'Default BPM (no beat map)', min: 60, max: 200, step: 1, default: 120},
      {key: 'audioLatencyMs', type: 'number', label: 'Audio latency (ms)', min: 0, max: 2000, step: 10, default: 100},
      {key: 'track', type: 'string', label: 'Track file (empty = random)', maxLength: 200, default: ''},
    ],
  },
  {
    key: 'effects',
    title: 'Effects',
    description: 'Optional extras.',
    fields: [{key: 'fog', type: 'boolean', label: 'Fog at serve', default: false}],
  },
];

function defaults() {
  var out = {};
  SECTIONS.forEach(function (section) {
    out[section.key] = {};
    section.fields.forEach(function (field) {
      out[section.key][field.key] = field.default;
    });
  });
  return out;
}

module.exports = {SECTIONS: SECTIONS, defaults: defaults};
