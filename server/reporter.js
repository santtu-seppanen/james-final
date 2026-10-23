// Standalone script, run on a cron (see crontab snippet below) that reports
// this James instance's current state to the public Cloudflare dashboard.
// Deliberately separate from index.js so it can run even if the main
// servo-control process is mid-restart, and so a reporting bug can't take
// down drink pouring.
//
// Crontab: */1 * * * * node /home/pi/socket-server-james/reporter.js
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
require('dotenv').config({path: path.join(__dirname, '.env')});

var DASHBOARD_URL = process.env.JAMES_DASHBOARD_URL;
var REPORT_TOKEN = process.env.JAMES_REPORT_TOKEN;

var bottlesConfig = path.join(__dirname, 'bottles_config.json');
var recipesConfig = path.join(__dirname, 'recipes_config.json');
var metricsPath = path.join(__dirname, 'metrics.json');

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

function report() {
  if (!DASHBOARD_URL || !REPORT_TOKEN) {
    console.error('JAMES_DASHBOARD_URL / JAMES_REPORT_TOKEN not set, skipping report.');
    return Promise.resolve();
  }

  var payload = buildPayload();

  return fetch(DASHBOARD_URL + '/api/report', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + REPORT_TOKEN,
    },
    body: JSON.stringify(payload),
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
