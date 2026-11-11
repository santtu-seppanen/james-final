// Validates and normalizes a James device config document. Used by the
// Cloudflare Worker before a version is stored, and again by the Pi
// (server/cloud-sync.js) before anything is written to disk - the cloud is
// internet-facing, so the device never trusts it blindly.
//
// Config shape (schemaVersion 1):
// {
//   "schemaVersion": 1,
//   "bottles": [{"name": "vodka", "serving": 25, "capacity": 700, "refilledAt": "2026-..."}],  // index = servo slot
//   "availableBottles": ["vodka", "tonic", ...],
//   "recipes": {"<id>": {"friendlyname": "...", "ingredients": [{"name", "serving", "manual"?, "wait"?}], "imageUrl"?}},
//   "settings": {"led": {...}, "audio": {...}, "show": {...}, "effects": {...}}   // see settings-schema.js
// }
//
// Shared between the Worker (bundled by wrangler) and the Pi (Node 10) -
// plain CommonJS, no modern syntax on purpose.

var settingsSchema = require('./settings-schema');

var SCHEMA_VERSION = 1;
var MAX_SLOTS = 6; // servos_config.json has 6 slots
var SERVINGS = [25, 50]; // same options as the kiosk's BottleAdmin
var MAX_CAPACITY_ML = 5000;
var MAX_RECIPES = 200;
var MAX_INGREDIENTS = 10;
var MAX_INGREDIENT_ML = 500;
var MAX_WAIT = 10;
var MAX_NAME = 60;
var ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
var IMAGE_RE = /^[A-Za-z0-9_-]{1,100}$/; // a key into the kiosk's bundled images, not a URL
var BOTTLE_NAME_RE = /^[A-Za-z0-9 _&().+'-]{1,40}$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Same comparison index.js uses in checkBottleName().
function bottleKey(name) {
  return String(name).replace(' ', '').toUpperCase();
}

function validateBottles(input, availableByKey, errors) {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_SLOTS) {
    errors.push('bottles: must be a list of 1-' + MAX_SLOTS + ' slots');
    return [];
  }
  return input.map(function (b, slot) {
    var where = 'bottles[' + slot + ']';
    if (!isPlainObject(b)) {
      errors.push(where + ': must be an object');
      return null;
    }
    var name = availableByKey[bottleKey(b.name)];
    if (!name) {
      errors.push(where + '.name: "' + b.name + '" is not in availableBottles');
    }
    var serving = Number(b.serving);
    if (SERVINGS.indexOf(serving) === -1) {
      errors.push(where + '.serving: must be ' + SERVINGS.join(' or ') + ' ml');
    }
    var capacity = Number(b.capacity);
    if (!isFinite(capacity) || capacity < 0 || capacity > MAX_CAPACITY_ML || capacity !== Math.round(capacity)) {
      errors.push(where + '.capacity: must be a whole number 0-' + MAX_CAPACITY_ML + ' ml');
    }
    var out = {name: name || String(b.name), serving: serving, capacity: capacity};
    if (b.refilledAt !== undefined && b.refilledAt !== null && b.refilledAt !== '') {
      if (typeof b.refilledAt !== 'string' || isNaN(Date.parse(b.refilledAt))) {
        errors.push(where + '.refilledAt: must be an ISO date string');
      } else {
        out.refilledAt = b.refilledAt;
      }
    }
    return out;
  });
}

function validateAvailable(input, errors) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) {
    errors.push('availableBottles: must be a list of 1-100 names');
    return [];
  }
  var seen = {};
  var out = [];
  input.forEach(function (name, i) {
    if (typeof name !== 'string' || !BOTTLE_NAME_RE.test(name)) {
      errors.push('availableBottles[' + i + ']: invalid name');
      return;
    }
    var key = bottleKey(name);
    if (seen[key]) {
      errors.push('availableBottles[' + i + ']: duplicate "' + name + '"');
      return;
    }
    seen[key] = true;
    out.push(name);
  });
  return out;
}

function validateRecipes(input, availableByKey, bottles, errors) {
  if (!isPlainObject(input)) {
    errors.push('recipes: must be an object keyed by recipe id');
    return {};
  }
  var ids = Object.keys(input);
  if (ids.length > MAX_RECIPES) {
    errors.push('recipes: at most ' + MAX_RECIPES + ' recipes');
    return {};
  }
  var loadedByKey = {};
  bottles.forEach(function (b) {
    if (b) loadedByKey[bottleKey(b.name)] = b;
  });

  var out = {};
  ids.forEach(function (id) {
    var where = 'recipes[' + id + ']';
    var r = input[id];
    if (!ID_RE.test(id) || id === '__proto__') {
      errors.push(where + ': id must match ' + ID_RE);
      return;
    }
    if (!isPlainObject(r)) {
      errors.push(where + ': must be an object');
      return;
    }
    if (typeof r.friendlyname !== 'string' || !r.friendlyname.trim() || r.friendlyname.length > MAX_NAME) {
      errors.push(where + '.friendlyname: required, at most ' + MAX_NAME + ' characters');
    }
    if (!Array.isArray(r.ingredients) || r.ingredients.length < 1 || r.ingredients.length > MAX_INGREDIENTS) {
      errors.push(where + '.ingredients: 1-' + MAX_INGREDIENTS + ' ingredients required');
      return;
    }
    var seen = {};
    var ingredients = r.ingredients.map(function (ing, i) {
      var iw = where + '.ingredients[' + i + ']';
      if (!isPlainObject(ing) || typeof ing.name !== 'string' || !ing.name.trim()) {
        errors.push(iw + ': name required');
        return null;
      }
      var manual = Boolean(ing.manual);
      var key = bottleKey(ing.name);
      var name = ing.name.trim();
      if (!manual) {
        if (!availableByKey[key]) {
          errors.push(iw + '.name: "' + ing.name + '" is not in availableBottles (or mark it manual)');
        } else {
          name = availableByKey[key];
        }
      } else if (name.length > MAX_NAME) {
        errors.push(iw + '.name: too long');
      }
      if (seen[key]) {
        errors.push(iw + ': duplicate ingredient "' + ing.name + '"');
      }
      seen[key] = true;

      var serving = Number(ing.serving);
      if (!isFinite(serving) || serving <= 0 || serving > MAX_INGREDIENT_ML || serving !== Math.round(serving)) {
        errors.push(iw + '.serving: must be a whole number 1-' + MAX_INGREDIENT_ML + ' ml');
      } else if (!manual && loadedByKey[key] && serving % loadedByKey[key].serving !== 0) {
        errors.push(iw + '.serving: must be a multiple of ' + loadedByKey[key].serving + ' ml (' + name + ' pour size)');
      }

      var outIng = {name: name, serving: serving};
      if (manual) outIng.manual = true;
      if (ing.wait !== undefined && ing.wait !== null && ing.wait !== '' && ing.wait !== 0) {
        var wait = Number(ing.wait);
        if (!isFinite(wait) || wait < 0 || wait > MAX_WAIT || wait !== Math.round(wait)) {
          errors.push(iw + '.wait: must be a whole number 0-' + MAX_WAIT);
        } else {
          outIng.wait = wait;
        }
      }
      return outIng;
    });

    var recipe = {friendlyname: String(r.friendlyname || '').trim(), ingredients: ingredients};
    if (r.imageUrl !== undefined && r.imageUrl !== null && r.imageUrl !== '') {
      if (typeof r.imageUrl !== 'string' || !IMAGE_RE.test(r.imageUrl)) {
        errors.push(where + '.imageUrl: must be an image name matching ' + IMAGE_RE);
      } else {
        recipe.imageUrl = r.imageUrl;
      }
    }
    out[id] = recipe;
  });
  return out;
}

function validateSettings(input, errors) {
  if (input === undefined || input === null) input = {};
  if (!isPlainObject(input)) {
    errors.push('settings: must be an object');
    return settingsSchema.defaults();
  }
  var out = {};
  // Unknown sections and fields pass through untouched (see settings-schema.js).
  // "__proto__" (an own key after JSON.parse) would replace the prototype on
  // assignment instead of being copied, so it's refused outright.
  Object.keys(input).forEach(function (key) {
    if (key === '__proto__' || (isPlainObject(input[key]) && Object.prototype.hasOwnProperty.call(input[key], '__proto__'))) {
      errors.push('settings.' + key + ': reserved key "__proto__"');
      return;
    }
    out[key] = isPlainObject(input[key]) ? Object.assign({}, input[key]) : input[key];
  });

  settingsSchema.SECTIONS.forEach(function (section) {
    var given = isPlainObject(input[section.key]) ? input[section.key] : {};
    if (input[section.key] !== undefined && !isPlainObject(input[section.key])) {
      errors.push('settings.' + section.key + ': must be an object');
    }
    var sectionOut = Object.assign({}, given);
    section.fields.forEach(function (field) {
      var where = 'settings.' + section.key + '.' + field.key;
      var value = given[field.key];
      if (value === undefined || value === null) {
        sectionOut[field.key] = field.default;
        return;
      }
      if (field.type === 'boolean') {
        if (typeof value !== 'boolean') errors.push(where + ': must be true or false');
      } else if (field.type === 'number') {
        var n = Number(value);
        if (typeof value !== 'number' || !isFinite(n) || n < field.min || n > field.max) {
          errors.push(where + ': must be a number ' + field.min + '-' + field.max);
        }
      } else if (field.type === 'enum') {
        if (field.options.indexOf(value) === -1) errors.push(where + ': must be one of ' + field.options.join(', '));
      } else if (field.type === 'string') {
        if (typeof value !== 'string' || value.length > (field.maxLength || 200)) {
          errors.push(where + ': must be a string');
        } else if (field.pattern && !new RegExp(field.pattern).test(value)) {
          errors.push(where + ': invalid characters');
        }
      }
      sectionOut[field.key] = value;
    });
    out[section.key] = sectionOut;
  });
  return out;
}

// Returns {ok: true, config: <normalized>} or {ok: false, errors: [...]}.
// Normalized means: bottle/ingredient names use the availableBottles casing,
// numbers are numbers, settings have every schema field filled in.
function validateConfig(input) {
  var errors = [];
  if (!isPlainObject(input)) {
    return {ok: false, errors: ['config must be an object']};
  }
  if (input.schemaVersion !== undefined && input.schemaVersion !== SCHEMA_VERSION) {
    errors.push('schemaVersion: expected ' + SCHEMA_VERSION);
  }

  var availableBottles = validateAvailable(input.availableBottles, errors);
  var availableByKey = {};
  availableBottles.forEach(function (name) {
    availableByKey[bottleKey(name)] = name;
  });

  var bottles = validateBottles(input.bottles, availableByKey, errors);
  var recipes = validateRecipes(input.recipes, availableByKey, bottles, errors);
  var settings = validateSettings(input.settings, errors);

  if (errors.length > 0) {
    return {ok: false, errors: errors};
  }
  return {
    ok: true,
    config: {
      schemaVersion: SCHEMA_VERSION,
      bottles: bottles,
      availableBottles: availableBottles,
      recipes: recipes,
      settings: settings,
    },
  };
}

// Stable serialization (sorted keys) so equal configs hash/compare equal
// regardless of key order.
function canonicalJson(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  if (isPlainObject(value)) {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .filter(function (k) {
          return value[k] !== undefined;
        })
        .map(function (k) {
          return JSON.stringify(k) + ':' + canonicalJson(value[k]);
        })
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value === undefined ? null : value);
}

module.exports = {
  validateConfig: validateConfig,
  canonicalJson: canonicalJson,
  bottleKey: bottleKey,
  SCHEMA_VERSION: SCHEMA_VERSION,
  MAX_SLOTS: MAX_SLOTS,
  SERVINGS: SERVINGS,
  MAX_CAPACITY_ML: MAX_CAPACITY_ML,
};
