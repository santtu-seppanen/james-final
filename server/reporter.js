// Standalone script, run on a cron (see crontab snippet below) that reports
// this James instance's current state to the public Cloudflare dashboard.
// Deliberately separate from index.js so it can run even if the main
// servo-control process is mid-restart, and so a reporting bug can't take
// down drink pouring.
//
// Run on a cron, e.g.: */1 * * * * node /home/pi/james-final/server/reporter.js
//
// Needs JAMES_DASHBOARD_URL and JAMES_REPORT_TOKEN in .env (see .env.example).
//
// NOTE: the Pi runs Node 10, which has no global fetch and no optional
// chaining (?.) / nullish coalescing (??). This file is written in
// Node 10-compatible syntax on purpose - don't "modernize" it without
// checking `node -v` on the Pi first.
var fs = require('fs');
var path = require('path');
var fetch = require('node-fetch');
var remoteRecipes = require('./remote-recipes');
require('dotenv').config({path: path.join(__dirname, '.env')});

var DASHBOARD_URL = process.env.JAMES_DASHBOARD_URL;
var REPORT_TOKEN = process.env.JAMES_REPORT_TOKEN;

// Same JAMES_DATA_DIR as index.js (see its comment near the top) - this
// has to read the real live files, not whatever stale snapshot sits next
// to it in the git checkout.
var DATA_DIR = process.env.JAMES_DATA_DIR || __dirname;
var bottlesConfig = path.join(DATA_DIR, 'bottles_config.json');
var recipesConfig = path.join(DATA_DIR, 'recipes_config.json');
var metricsPath = path.join(DATA_DIR, 'metrics.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('Could not read ' + file + ': ' + e.message);
    return fallback;
  }
}

function findSummaryValue(items, titlePrefix) {
  for (var i = 0; i < items.length; i++) {
    if (items[i] && items[i].title && items[i].title.indexOf(titlePrefix) === 0) {
      return items[i].value;
    }
  }
  return 0;
}

function buildPayload() {
  var bottles = readJson(bottlesConfig, []);
  var recipes = readJson(recipesConfig, {});
  var metrics = readJson(metricsPath, null);

  var summaryItems =
    (metrics &&
      metrics.containers &&
      metrics.containers[1] &&
      metrics.containers[1].controls &&
      metrics.containers[1].controls[0] &&
      metrics.containers[1].controls[0].summaries &&
      metrics.containers[1].controls[0].summaries[0] &&
      metrics.containers[1].controls[0].summaries[0].items) ||
    [];

  var drinksServed = findSummaryValue(summaryItems, 'Drinks served');
  var alcoholServedMl = findSummaryValue(summaryItems, 'Alcohol poured');

  return {
    status: {drinksServed: drinksServed, alcoholServedMl: alcoholServedMl},
    bottles: bottles.map(function (b) {
      return {
        name: b.name,
        capacityMl: Number(b.capacity),
        originalCapacityMl: Number(b.originalCapacity),
        servingMl: Number(b.serving),
      };
    }),
    recipes: Object.keys(recipes).map(function (id) {
      var recipe = recipes[id];
      return {
        id: id,
        friendlyName: recipe.friendlyname,
        imageUrl: recipe.imageUrl,
        ingredients: recipe.ingredients,
      };
    }),
  };
}

// Pulls recipe edits queued from the public dashboard, applies them to
// recipes_config.json and acks the outcome. Runs before buildPayload() so
// the report that follows already reflects the new recipes.
function applyRemoteCommands() {
  var headers = {authorization: 'Bearer ' + REPORT_TOKEN, 'content-type': 'application/json'};

  return fetch(DASHBOARD_URL + '/api/commands', {headers: headers})
    .then(function (response) {
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      return response.json();
    })
    .then(function (body) {
      var commands = body.commands || [];
      if (commands.length === 0) {
        return null;
      }

      var recipes = readJson(recipesConfig, null);
      var bottles = readJson(bottlesConfig, null);
      if (!recipes || !bottles) {
        return null; // leave them pending, try again next minute
      }

      var results = remoteRecipes.applyCommands(recipes, bottles, commands);
      if (results.some(function (r) { return r.ok; })) {
        fs.writeFileSync(recipesConfig, JSON.stringify(recipes));
      }
      console.log('Applied ' + commands.length + ' dashboard recipe command(s)');

      return fetch(DASHBOARD_URL + '/api/commands', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({results: results}),
      });
    })
    .catch(function (e) {
      console.error('Recipe commands failed: ' + e.message);
    });
}

function report() {
  if (!DASHBOARD_URL || !REPORT_TOKEN) {
    console.error('JAMES_DASHBOARD_URL / JAMES_REPORT_TOKEN not set, skipping report.');
    return Promise.resolve();
  }

  return applyRemoteCommands()
    .then(function () {
      return fetch(DASHBOARD_URL + '/api/report', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer ' + REPORT_TOKEN,
        },
        body: JSON.stringify(buildPayload()),
      });
    })
    .then(function (response) {
      if (!response.ok) {
        return response.text().then(function (text) {
          console.error('Report failed: ' + response.status + ' ' + text);
        });
      }
      console.log('Reported to dashboard OK');
    })
    .catch(function (e) {
      console.error('Report failed: ' + e.message);
    });
}

if (require.main === module) {
  report();
}

module.exports = {buildPayload: buildPayload, report: report};
