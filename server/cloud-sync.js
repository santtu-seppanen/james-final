// Cloud sync client: keeps this James in step with the config published at
// the Cloudflare Worker in cloud/ and reports the device's state back.
//
// One cycle (runOnce):
//   1. GET  <JAMES_CLOUD_URL>/api/device/config with If-None-Match: <last etag>
//      304 -> nothing to do. 200 -> validate (cloud/shared/config-validate.js,
//      the same code the Worker ran) and only then write bottles_config.json,
//      recipes_config.json, available_bottles_config.json and settings.json
//      in JAMES_DATA_DIR. Invalid -> keep the current files, report "rejected".
//   2. POST <JAMES_CLOUD_URL>/api/device/stats with uptime, deployed version,
//      bottle levels, per-bottle pour counters, drinks served, new pours,
//      recent errors and which config version is applied. The reply names
//      the current version; if it's newer than ours, step 1 runs again.
//
// Deliberately a separate process from index.js (like reporter.js): a
// cloud outage, a bug here or a slow DNS lookup can never block a pour.
// index.js watches bottles/recipes files, so an applied config shows up on
// the kiosk by itself. If the cloud is unreachable the last applied
// (= last known good) files simply stay in place.
//
// Run from cron once a minute (one cycle, then exit):
//   */1 * * * * node /home/pi/james-final/server/cloud-sync.js >> /home/pi/james-final/cloud-sync.log 2>&1
// or as a long-running loop (JAMES_CLOUD_POLL_MS between cycles):
//   node cloud-sync.js --daemon
// Either way failures back off exponentially (state file keeps the timer,
// so cron runs skip until the backoff expires).
//
// Env (server/.env): JAMES_CLOUD_URL, JAMES_CLOUD_DEVICE_TOKEN, optional
// JAMES_CLOUD_POLL_MS, JAMES_CLOUD_TIMEOUT_MS, JAMES_SERVER_URL, JAMES_DATA_DIR.
//
// NOTE: the Pi runs Node 10 - no optional chaining, no global fetch, no
// Object.fromEntries. Node 10-compatible syntax on purpose.
var fs = require('fs');
var os = require('os');
var path = require('path');
var nodeFetch = require('node-fetch');
var configValidate = require(path.join(__dirname, '..', 'cloud', 'shared', 'config-validate.js'));
require('dotenv').config({path: path.join(__dirname, '.env')});

var STATE_FILE = 'cloud-sync-state.json';
var SETTINGS_FILE = 'settings.json';
var MAX_ERRORS = 20;
var ERROR_RETENTION_MS = 24 * 60 * 60 * 1000;
var BACKOFF_BASE_MS = 30 * 1000;
var BACKOFF_MAX_MS = 15 * 60 * 1000;
var MAX_POURS_PER_REPORT = 200; // the Worker keeps at most this many per report
var ETAG_RE = /^"[\x21\x23-\x7e]{1,100}"$/; // quoted, printable, safe to send back as a header

// The device token must never travel in clear text: plain http is only
// accepted for a Worker on this machine (wrangler dev).
function isSafeCloudUrl(url) {
  return /^https:\/\/[^\/]/.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url);
}

function nowIso() {
  return new Date().toISOString();
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

// Write to a temp file and rename so a crash mid-write can't leave a
// half-written config for index.js to choke on.
function writeJsonAtomic(file, value) {
  var tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch (e) {
    return null;
  }
}

function defaultState() {
  return {
    etag: null, // ETag of the last version we looked at (applied or rejected)
    applied: null, // {version, etag, status, error, at}
    refills: {}, // slot -> refilledAt we last honoured
    failures: 0,
    nextAttemptAt: null,
    lastCapacities: {}, // slot -> {name, capacity}, for the per-bottle counters
    bottleCounters: {}, // name -> {pours, ml}
    lastDrinksServed: null,
    lastSplits: {}, // drink title -> count, from metrics.json
    poursOffset: 0, // bytes of pours.jsonl already reported
    errors: [],
  };
}

// opts: {dataDir, serverDir, cloudUrl, token, fetch, serverUrl, timeoutMs, log, now}
function createSyncClient(opts) {
  opts = opts || {};
  var dataDir = opts.dataDir || process.env.JAMES_DATA_DIR || __dirname;
  var serverDir = opts.serverDir || __dirname;
  var cloudUrl = (opts.cloudUrl || process.env.JAMES_CLOUD_URL || '').replace(/\/+$/, '');
  var token = opts.token || process.env.JAMES_CLOUD_DEVICE_TOKEN || '';
  var fetch = opts.fetch || nodeFetch;
  var serverUrl = opts.serverUrl || process.env.JAMES_SERVER_URL || 'http://localhost:8000';
  var timeoutMs = opts.timeoutMs || Number(process.env.JAMES_CLOUD_TIMEOUT_MS) || 10000;
  var log = opts.log || console.log;
  var now = opts.now || Date.now;

  var files = {
    bottles: path.join(dataDir, 'bottles_config.json'),
    recipes: path.join(dataDir, 'recipes_config.json'),
    available: path.join(dataDir, 'available_bottles_config.json'),
    settings: path.join(dataDir, SETTINGS_FILE),
    metrics: path.join(dataDir, 'metrics.json'),
    pours: path.join(dataDir, 'pours.jsonl'),
    state: path.join(dataDir, STATE_FILE),
    version: path.join(serverDir, 'VERSION'),
  };

  var state = Object.assign(defaultState(), readJson(files.state, {}));

  function saveState() {
    try {
      writeJsonAtomic(files.state, state);
    } catch (e) {
      log('cloud-sync: could not save state: ' + e.message);
    }
  }

  function recordError(source, message) {
    log('cloud-sync: ' + source + ': ' + message);
    state.errors.push({at: new Date(now()).toISOString(), source: source, message: String(message).slice(0, 500)});
    if (state.errors.length > MAX_ERRORS) state.errors = state.errors.slice(-MAX_ERRORS);
  }

  function headers(extra) {
    return Object.assign({authorization: 'Bearer ' + token, 'content-type': 'application/json'}, extra || {});
  }

  // --- config ---

  function fetchConfig() {
    var extra = state.etag ? {'if-none-match': state.etag} : {};
    return fetch(cloudUrl + '/api/device/config', {headers: headers(extra), timeout: timeoutMs}).then(function (res) {
      if (res.status === 304) return {status: 'unchanged'};
      if (res.status === 404) return {status: 'none'};
      if (!res.ok) throw new Error('config HTTP ' + res.status);
      return res.json().then(function (body) {
        // The etag is sent back as If-None-Match and stored, so a malformed
        // one would wedge every later cycle - treat it as a bad response.
        if (!body || typeof body !== 'object' || typeof body.etag !== 'string' || !ETAG_RE.test(body.etag) || !(Number(body.version) > 0)) {
          throw new Error('config: malformed response');
        }
        return {status: 'new', body: body};
      });
    });
  }

  // Merges the published bottle list with the live fill levels: the cloud
  // knows what's in each slot and how big the bottle is, the Pi knows how
  // much is left. A changed bottle/capacity, or a new refilledAt stamp,
  // means "refilled" and the level resets to full - same semantics as the
  // kiosk's BottleAdmin and remote-bottles.js.
  //
  // A refilledAt stamp only counts when it's newer than the last one
  // honoured for that slot, so rolling back to an older version (or
  // forward again past one without stamps) doesn't refill anything.
  function mergeBottles(configBottles, liveBottles) {
    var refills = Object.assign({}, state.refills);
    var merged = configBottles.map(function (b, slot) {
      var live = liveBottles[slot];
      var sameBottle = live && configValidate.bottleKey(live.name) === configValidate.bottleKey(b.name);
      var sameSize = live && Number(live.originalCapacity) === b.capacity;
      var lastRefill = state.refills[slot] ? Date.parse(state.refills[slot]) : NaN;
      var newRefill = Boolean(b.refilledAt) && !(Date.parse(b.refilledAt) <= lastRefill);
      var refilled = !sameBottle || !sameSize || newRefill;
      if (newRefill) refills[slot] = b.refilledAt;
      return {
        name: b.name,
        serving: b.serving,
        capacity: refilled ? b.capacity : Number(live.capacity),
        originalCapacity: refilled ? b.capacity : Number(live.originalCapacity),
      };
    });
    return {bottles: merged, refills: refills};
  }

  function applyConfig(body) {
    var result = configValidate.validateConfig(body.config);
    var stamp = {version: body.version, etag: body.etag, at: new Date(now()).toISOString()};
    if (!result.ok) {
      state.applied = Object.assign(stamp, {status: 'rejected', error: result.errors.slice(0, 5).join('; ')});
      state.etag = body.etag; // don't re-download the same bad version every minute
      recordError('config', 'rejected v' + body.version + ': ' + state.applied.error);
      return false;
    }
    var config = result.config;
    var liveBottles = readJson(files.bottles, []);
    if (!Array.isArray(liveBottles)) liveBottles = [];
    var merged = mergeBottles(config.bottles, liveBottles);

    // Keep copies so a failed write in the middle can be undone.
    var backups = {};
    [files.bottles, files.recipes, files.available, files.settings].forEach(function (file) {
      backups[file] = readText(file);
    });
    try {
      writeJsonAtomic(files.available, config.availableBottles);
      writeJsonAtomic(files.recipes, config.recipes);
      writeJsonAtomic(files.bottles, merged.bottles);
      writeJsonAtomic(files.settings, config.settings);
    } catch (e) {
      Object.keys(backups).forEach(function (file) {
        if (backups[file] !== null) {
          try { fs.writeFileSync(file, backups[file]); } catch (e2) { /* best effort */ }
        }
      });
      state.applied = Object.assign(stamp, {status: 'rejected', error: 'write failed: ' + e.message});
      recordError('config', state.applied.error);
      return false;
    }
    state.refills = merged.refills;
    state.etag = body.etag;
    state.applied = Object.assign(stamp, {status: 'applied', error: null});
    log('cloud-sync: applied config v' + body.version);
    return true;
  }

  function syncConfig() {
    return fetchConfig().then(function (result) {
      if (result.status === 'new') return applyConfig(result.body);
      return false;
    });
  }

  // --- stats ---

  function checkServer() {
    return fetch(serverUrl + '/api/version', {timeout: 3000})
      .then(function (res) {
        if (!res.ok) return {reachable: false};
        return res.json().then(function (body) {
          return {reachable: true, version: body.version};
        });
      })
      .catch(function () {
        return {reachable: false};
      });
  }

  function summaryValue(metrics, prefix) {
    try {
      var items = metrics.containers[1].controls[0].summaries[0].items;
      for (var i = 0; i < items.length; i++) {
        if (items[i] && String(items[i].title).indexOf(prefix) === 0) return Number(items[i].value) || 0;
      }
    } catch (e) {
      // metrics.json missing or in an unexpected shape
    }
    return 0;
  }

  function drinkSplits(metrics) {
    var out = {};
    try {
      metrics.containers[1].controls[0].metrics.forEach(function (split) {
        if (split && split.title) out[split.title] = Number(split.value) || 0;
      });
    } catch (e) {
      // no splits
    }
    return out;
  }

  // Per-bottle pour counters from capacity decreases between cycles: a
  // decrease of N ml on a slot that still holds the same bottle is N ml
  // poured. Increases (refills, edits) are ignored.
  function updateBottleCounters(bottles) {
    var next = {};
    bottles.forEach(function (b, slot) {
      var capacity = Number(b.capacity);
      var serving = Number(b.serving) || 25;
      var prev = state.lastCapacities[slot];
      if (prev && prev.name === b.name && isFinite(prev.capacity) && isFinite(capacity) && capacity < prev.capacity) {
        var ml = prev.capacity - capacity;
        var counter = state.bottleCounters[b.name] || {pours: 0, ml: 0};
        counter.ml += ml;
        counter.pours += Math.max(1, Math.round(ml / serving));
        state.bottleCounters[b.name] = counter;
      }
      next[slot] = {name: b.name, capacity: capacity};
    });
    state.lastCapacities = next;
  }

  // New pours since the last cycle. Preferred source: pours.jsonl (one JSON
  // object per line: {ts, recipeId, friendlyname, ingredients, alcoholMl}),
  // which doesn't exist yet - see issue #15. Fallback: the per-drink counts
  // in metrics.json, which only tell us how many, not when.
  //
  // Returns {pours, commit}: the read position / last counts only move on
  // when commit() is called after the cloud accepted the report, so pours
  // made while the cloud is down are sent once it's back, not lost.
  function collectPours(metrics, recipes) {
    var pours = [];
    var stamp = new Date(now()).toISOString();
    if (fs.existsSync(files.pours)) {
      var offset = state.poursOffset;
      var size = fs.statSync(files.pours).size;
      if (size < offset) offset = 0; // file was truncated/rotated
      if (size > offset) {
        var fd = fs.openSync(files.pours, 'r');
        var buffer = Buffer.alloc(size - offset);
        fs.readSync(fd, buffer, 0, buffer.length, offset);
        fs.closeSync(fd);
        var consumed = 0;
        var start = 0;
        var newline;
        // Whole lines only (a partial last line waits for the rest), and no
        // more than one report's worth - the remainder goes next cycle.
        while (pours.length < MAX_POURS_PER_REPORT && (newline = buffer.indexOf(10, start)) !== -1) {
          var line = buffer.slice(start, newline).toString('utf8');
          start = newline + 1;
          consumed = start;
          if (!line.trim()) continue;
          try {
            var p = JSON.parse(line);
            pours.push({
              recipeId: p.recipeId || null,
              friendlyName: p.friendlyname || p.friendlyName || null,
              alcoholMl: Number(p.alcoholMl) || 0,
              ingredients: p.ingredients || null,
              pouredAt: p.ts || stamp,
            });
          } catch (e) {
            // skip bad line
          }
        }
        offset += consumed;
      }
      return {
        pours: pours,
        commit: function () {
          state.poursOffset = offset;
        },
      };
    }

    var splits = drinkSplits(metrics);
    var byName = {};
    Object.keys(recipes).forEach(function (id) {
      byName[recipes[id].friendlyname] = id;
    });
    var total = summaryValue(metrics, 'Drinks served');
    // Counters live in index.js memory, so a backend restart resets them to
    // 0 - treat a drop as a restart and start counting from the new base.
    var restarted = state.lastDrinksServed !== null && total < state.lastDrinksServed;
    if (state.lastDrinksServed !== null && !restarted) {
      Object.keys(splits).forEach(function (title) {
        var delta = splits[title] - (state.lastSplits[title] || 0);
        var alcoholPerDrink = 0;
        var recipe = byName[title] ? recipes[byName[title]] : null;
        if (recipe) {
          recipe.ingredients.forEach(function (ing) {
            if (!ing.manual) alcoholPerDrink += Number(ing.serving) || 0;
          });
        }
        for (var i = 0; i < delta && i < 50; i++) {
          pours.push({recipeId: byName[title] || null, friendlyName: title, alcoholMl: alcoholPerDrink, pouredAt: stamp});
        }
      });
    }
    return {
      pours: pours,
      commit: function () {
        state.lastSplits = splits;
        state.lastDrinksServed = total;
      },
    };
  }

  function systemInfo() {
    var ip = null;
    try {
      var nets = os.networkInterfaces();
      Object.keys(nets).forEach(function (name) {
        nets[name].forEach(function (net) {
          if (net.family === 'IPv4' && !net.internal && !ip) ip = net.address;
        });
      });
    } catch (e) {
      // fine
    }
    return {
      hostname: os.hostname(),
      model: readText('/proc/device-tree/model'),
      ip: ip,
      nodeVersion: process.version,
      loadAvg: os.loadavg(),
      freeMemMb: Math.round(os.freemem() / 1048576),
    };
  }

  function buildStats(server) {
    var bottles = readJson(files.bottles, []);
    if (!Array.isArray(bottles)) bottles = [];
    var recipes = readJson(files.recipes, {});
    var available = readJson(files.available, []);
    var metrics = readJson(files.metrics, null);

    updateBottleCounters(bottles);
    var pours = collectPours(metrics, recipes);

    var payload = {
      deviceVersion: readText(files.version) || server.version || null,
      uptimeS: Math.round(os.uptime()),
      serverReachable: server.reachable,
      appliedConfig: state.applied,
      bottles: bottles.map(function (b, slot) {
        return {
          slot: slot,
          name: b.name,
          capacityMl: Number(b.capacity),
          originalCapacityMl: Number(b.originalCapacity),
          servingMl: Number(b.serving),
        };
      }),
      recipes: Object.keys(recipes).map(function (id) {
        return {id: id, friendlyname: recipes[id].friendlyname, ingredients: recipes[id].ingredients, imageUrl: recipes[id].imageUrl};
      }),
      availableBottles: Array.isArray(available) ? available : [],
      counters: {
        drinksServed: summaryValue(metrics, 'Drinks served'),
        alcoholServedMl: summaryValue(metrics, 'Alcohol poured'),
      },
      bottleCounters: state.bottleCounters,
      pours: pours.pours,
      errors: state.errors,
      system: systemInfo(),
    };
    return {payload: payload, commit: pours.commit};
  }

  function reportStats() {
    return checkServer().then(function (server) {
      var stats = buildStats(server);
      return fetch(cloudUrl + '/api/device/stats', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(stats.payload),
        timeout: timeoutMs,
      }).then(function (res) {
        if (!res.ok) throw new Error('stats HTTP ' + res.status);
        stats.commit();
        return res.json();
      });
    });
  }

  // --- cycle ---

  function backoffMs() {
    return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * Math.pow(2, Math.max(0, state.failures - 1)));
  }

  function runOnce() {
    if (!cloudUrl || !token) {
      log('cloud-sync: JAMES_CLOUD_URL / JAMES_CLOUD_DEVICE_TOKEN not set, skipping.');
      return Promise.resolve({skipped: true});
    }
    if (!isSafeCloudUrl(cloudUrl)) {
      log('cloud-sync: JAMES_CLOUD_URL must be https:// (http only for localhost), skipping.');
      return Promise.resolve({skipped: true});
    }
    if (state.nextAttemptAt && now() < state.nextAttemptAt) {
      return Promise.resolve({skipped: true, backoffUntil: state.nextAttemptAt});
    }

    var summary = {applied: false};
    // Everything inside the chain, so even a synchronous throw ends up in
    // the catch below (backoff) instead of escaping runOnce.
    return Promise.resolve()
      .then(syncConfig)
      .then(function (applied) {
        summary.applied = applied;
        return reportStats();
      })
      .then(function (reply) {
        summary.reported = true;
        // The reply names the current version: if it's not what we have
        // (e.g. published between our GET and POST), fetch it right away.
        if (reply && reply.config && reply.config.etag && reply.config.etag !== state.etag) {
          return syncConfig().then(function (applied) {
            summary.applied = summary.applied || applied;
          });
        }
      })
      .then(function () {
        state.failures = 0;
        state.nextAttemptAt = null;
        // Every report carries the full list (the cloud keeps the latest
        // snapshot only), so keep a day's worth visible in the UI.
        var cutoff = now() - ERROR_RETENTION_MS;
        state.errors = state.errors.filter(function (e) {
          return Date.parse(e.at) >= cutoff;
        });
      })
      .catch(function (e) {
        state.failures += 1;
        state.nextAttemptAt = now() + backoffMs();
        summary.error = e.message;
        recordError('network', e.message + ' (retry in ' + Math.round(backoffMs() / 1000) + 's)');
      })
      .then(function () {
        saveState();
        return summary;
      });
  }

  function start(pollMs) {
    pollMs = pollMs || Number(process.env.JAMES_CLOUD_POLL_MS) || 60000;
    var stopped = false;
    function loop() {
      if (stopped) return;
      runOnce().then(function () {
        var wait = state.nextAttemptAt ? Math.max(pollMs, state.nextAttemptAt - now()) : pollMs;
        setTimeout(loop, wait);
      });
    }
    loop();
    return function stop() {
      stopped = true;
    };
  }

  return {runOnce: runOnce, start: start, getState: function () { return state; }, files: files};
}

if (require.main === module) {
  var client = createSyncClient();
  if (process.argv.indexOf('--daemon') !== -1) {
    client.start();
  } else {
    client.runOnce().then(function (summary) {
      if (summary.error) process.exitCode = 1;
      else if (!summary.skipped) console.log('cloud-sync: OK' + (summary.applied ? ' (config applied)' : ''));
    });
  }
}

module.exports = {createSyncClient: createSyncClient};
