// Applies bottle edits queued from the public dashboard (see
// cloudflare/functions/api/admin/bottles.js) to bottles_config.json.
// Called from reporter.js. Everything is validated here, on the Pi.
//
// Bottles are positional: the array index is the servo number, so a command
// edits a slot in place and never reorders or resizes the list.
//
// Node 10-compatible syntax on purpose (see reporter.js).

var SERVINGS = [25, 50]; // same options as the kiosk's BottleAdmin
var MAX_CAPACITY_ML = 5000;

// bottles: array from bottles_config.json (mutated). available: names from
// available_bottles_config.json. commands: [{id, slot, bottle: {name,
// capacity, serving}}]. Returns [{id, ok, error?}].
function applyBottleCommands(bottles, available, commands) {
  var availableByName = {};
  available.forEach(function (name) {
    availableByName[String(name).toUpperCase()] = name;
  });

  return commands.map(function (cmd) {
    var current = bottles[cmd.slot];
    if (!current) {
      return {id: cmd.id, ok: false, error: 'No such slot: ' + cmd.slot};
    }

    var b = cmd.bottle || {};
    var name = availableByName[String(b.name).toUpperCase()];
    var capacity = Number(b.capacity);
    var serving = Number(b.serving);

    if (!name) {
      return {id: cmd.id, ok: false, error: 'Unknown bottle: ' + b.name};
    }
    if (!isFinite(capacity) || capacity < 0 || capacity > MAX_CAPACITY_ML) {
      return {id: cmd.id, ok: false, error: 'Capacity must be 0-' + MAX_CAPACITY_ML + ' ml'};
    }
    if (SERVINGS.indexOf(serving) === -1) {
      return {id: cmd.id, ok: false, error: 'Pour size must be ' + SERVINGS.join(' or ') + ' ml'};
    }

    // Same meaning as the kiosk: changing the capacity (or swapping the
    // bottle) means "this was refilled", so the fill gauge starts at 100%.
    var refilled = name !== current.name || capacity !== Number(current.capacity);
    bottles[cmd.slot] = {
      name: name,
      serving: serving,
      capacity: capacity,
      originalCapacity: refilled ? capacity : Number(current.originalCapacity),
    };
    return {id: cmd.id, ok: true};
  });
}

module.exports = {applyBottleCommands: applyBottleCommands};
