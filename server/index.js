// Load .env before anything below reads process.env (JAMES_DATA_DIR
// especially - reading it too late silently falls back to ".", defeating
// the whole point of keeping live state outside the git checkout).
require("dotenv").config();

const express = require("express");
const app = express();
var http = require("http").createServer(app);
var io = require("socket.io")(http);
var cors = require("cors");
var fs = require("fs");
var exec = require("child_process").exec;
var aiModule = require("./ai");
var shots = require("./shots");
var path = require("path");
// Live, mutable state (bottle levels, saved recipes, usage metrics) lives
// outside the git-tracked directory when JAMES_DATA_DIR is set, so that
// auto-deploy's `git pull` can never clobber it - only servos_config.json
// (static GPIO pin mapping, never written at runtime) stays with the code.
// Unset (local dev), everything just lives next to index.js as before.
const DATA_DIR = process.env.JAMES_DATA_DIR || ".";
const recipesConfig = path.join(DATA_DIR, "recipes_config.json");
const servos = require("./servos_config.json");
const metricsPath = path.join(DATA_DIR, "metrics.json");
const pourTimeoutMs = 8000;
const bottlesConfig = path.join(DATA_DIR, "bottles_config.json");
const availableBottlesConfig = path.join(DATA_DIR, "available_bottles_config.json");
const { networkInterfaces } = require("os");
const nets = networkInterfaces();
var bottles = [];
var recipes = {};
const socketName = "servoState";
// ****** Metrics variables ******
// Kept locally in metrics.json (read by the separate cloud sync process, which reports to the
// cloud Worker on its own schedule, so no live inbound connection is needed).

// First run against a fresh DATA_DIR (e.g. right after migrating to it):
// seed bottles/recipes/available-bottles from the committed snapshot next
// to this file, so there's something valid to read/write instead of
// crashing. metrics.json has no committed seed (it's runtime-generated,
// deliberately not in git) - give it an empty-but-valid default instead.
const resolvedDataDir = path.resolve(DATA_DIR);
if (resolvedDataDir !== path.resolve(".")) {
  fs.mkdirSync(resolvedDataDir, { recursive: true });

  [
    [bottlesConfig, "./bottles_config.json"],
    [recipesConfig, "./recipes_config.json"],
    [availableBottlesConfig, "./available_bottles_config.json"],
  ].forEach(([liveePath, seedPath]) => {
    if (!fs.existsSync(liveePath)) {
      console.log("Seeding " + liveePath + " from " + seedPath);
      fs.copyFileSync(seedPath, liveePath);
    }
  });

  if (!fs.existsSync(metricsPath)) {
    console.log("Creating default " + metricsPath);
    fs.writeFileSync(
      metricsPath,
      JSON.stringify({
        containers: [
          {title: "James Bottles", controls: []},
          {
            title: "James Drinks",
            controls: [
              {
                id: 1,
                title: "James Usage Summary",
                splitTitle: "Drinks",
                isActive: true,
                type: "pie",
                mainMetric: 0,
                mainMetricUnit: "%",
                summaries: [{title: "James Usage Summary", items: []}],
                metrics: [],
              },
            ],
          },
        ],
        origin: "server",
      }),
    );
  }
}

const gauges = [];
let metricsData = JSON.parse(fs.readFileSync(metricsPath));
let drinksServed = 0;
let alcoholServed = 0;
let drinksSplits = [];

require("dotenv").config();

// middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
// The kiosk UI (ui/build, built by scripts/deploy.sh) is served from here, so
// there is no separate web server on the Pi.
app.use(express.static(path.join(__dirname, "..", "ui", "build")));

// scripts/deploy.sh writes VERSION (the deployed commit SHA) right after a
// successful pull+build. The UI polls this and prompts a reload when it
// changes, since a backend restart won't otherwise be visible to an
// already-open kiosk page.
app.get("/api/version", (req, res) => {
  let version = "unknown";
  try {
    version = fs.readFileSync(path.join(__dirname, "VERSION"), "utf8").trim();
  } catch (e) {
    // No VERSION file (e.g. local dev, not deployed via the script) - fine.
  }
  res.json({ version });
});

app.get("/getBottles", (req, res) => {
  console.log("Getting bottles");
  fs.readFile(bottlesConfig, "utf8", function (err, data) {
    res.json(data);
  });
});

app.get("/getAvailableBottles", (req, res) => {
  console.log("Getting all bottles.");
  fs.readFile(availableBottlesConfig, "utf8", function (err, data) {
    res.json(data);
  });
});

app.get("/getIp", (req, res) => {
  let results = {};
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        results["ip"] = [];
        results["ip"].push(net.address);
      }
    }
  }

  res.json(results);
});

app.post("/setBottles", (req, res) => {
  console.log("Setting bottles");
  let newBottles = JSON.stringify(req.body);
  fs.writeFileSync(bottlesConfig, newBottles);

  // set values to metrics object
  gauges.splice(0, gauges.length);
  bottles.map((bottle, i) => {
    let gaugeConfig = {
      id: i,
      title: bottle.name,
      isActive: true,
      type: "gauge",
      mainMetric: 100,
      mainMetricUnit: "%",
      metrics: [],
    };
    gauges.push(gaugeConfig);
  });

  metricsData.containers[0].controls = gauges;
  fs.writeFileSync(metricsPath, JSON.stringify(metricsData));

  res.json(newBottles);
});

app.post("/setAvailableBottles", (req, res) => {
  console.log("Setting all bottles");
  let newBottles = JSON.stringify(req.body);
  fs.writeFileSync(availableBottlesConfig, newBottles);
  res.json(newBottles);
});

app.get("/getRecipes", (req, res) => {
  console.log("Getting recipes");
  fs.readFile(recipesConfig, "utf8", function (err, recipes) {
    let allDrinks = getDrinks(false);
    res.json(JSON.stringify(allDrinks));
  });
});

app.post("/setRecipes", (req, res) => {
  console.log("Setting recipes");
  let newRecipes = JSON.stringify(formatRecipes(req.body));
  fs.writeFileSync(recipesConfig, newRecipes);
  res.json(JSON.stringify(req.body));
});

app.post("/drinkme", (req, res) => {
  console.log(req.body);

  let recipe;
  if (req.body.recipe) {
    // Ad-hoc recipe (e.g. an AI-generated one the user hasn't saved yet) -
    // validate it server-side rather than trusting the client blindly.
    const bottlesByName = {};
    bottles.forEach((b) => {
      bottlesByName[String(b.name).toUpperCase()] = b;
    });
    const validationError = aiModule.validateRecipe(req.body.recipe, bottlesByName);
    if (validationError) {
      return res.status(400).json(JSON.stringify({ success: false, error: validationError }));
    }
    recipe = req.body.recipe;
  } else {
    const recipes = JSON.parse(fs.readFileSync(recipesConfig));
    recipe = recipes[req.body.drink];
  }

  const totalPourTime = pourDrink(recipe);
  if (totalPourTime == 0) {
    res.json(JSON.stringify({ success: false, pourTime: totalPourTime }));
  } else {
    res.json(JSON.stringify({ success: true, pourTime: totalPourTime }));
  }
});

// Shot mode: five shot glasses on the belt, filled one at a time from one
// bottle. Body: {bottle: "vodka"}.
app.post("/shots", (req, res) => {
  const wanted = String(req.body.bottle || "").toUpperCase();
  const choice = shots
    .shotBottles(bottles, 1)
    .filter((c) => String(c.bottle.name).toUpperCase() === wanted)[0];
  if (!choice) {
    return res.status(400).json(JSON.stringify({ success: false, error: "Unknown bottle" }));
  }
  if (!shots.shotBottles(bottles, shots.SHOT_COUNT).some((c) => c.slot === choice.slot)) {
    return res.status(400).json(JSON.stringify({ success: false, error: "Not enough left in " + choice.bottle.name }));
  }
  res.json(JSON.stringify({ success: true, pourTime: pourShots(choice.slot) }));
});

app.post("/api/generate-drink", (req, res) => {
  let existingNames = [];
  try {
    existingNames = Object.values(JSON.parse(fs.readFileSync(recipesConfig))).map(
      (r) => r.friendlyname
    );
  } catch (e) {
    // Fine - the prompt just won't list the menu.
  }

  aiModule
    .generateDrink(bottles, existingNames)
    .then((recipe) => {
      res.json(recipe);
    })
    .catch((err) => {
      console.log("AI generate-drink failed:", err.message);
      res.status(502).json({ error: err.message });
    });
});

app.post("/api/save-recipe", (req, res) => {
  const { name, recipe } = req.body;
  if (!name || !recipe || !Array.isArray(recipe.ingredients)) {
    return res.status(400).json({ error: "name and recipe.ingredients are required" });
  }

  const recipes = JSON.parse(fs.readFileSync(recipesConfig));
  const id = String(Date.now());
  recipes[id] = {
    friendlyname: name,
    ingredients: recipe.ingredients,
    imageUrl: recipe.imageUrl || "humppaleka",
    garnish: recipe.garnish,
    color: recipe.color,
  };
  fs.writeFileSync(recipesConfig, JSON.stringify(recipes));

  res.json({ id, friendlyname: name });
});

function pourDrink(recipe) {
  toggleLed(1);
  var servoState = [false, false, false, false, false, false, false, false];
  let totalPourCount = 1;
  if (recipe) {
    console.log(recipe);
    drinksServed++;
    let drinkSplit = {
      title: recipe.friendlyname,
      value: 1,
      unit: "unit(s)",
    };
    let foundSplit = false;
    drinksSplits.map((split) => {
      if (split && split.title === recipe.friendlyname) {
        split.value++;
        foundSplit = true;
      }
    });
    if (!foundSplit) {
      drinksSplits.push(drinkSplit);
    }
    for (let ingredient of recipe.ingredients) {
      // Fizzy mixers are poured by hand, even if a bottle of it is loaded.
      if (ingredient.manual) continue;
      bottles.forEach(function (bottle, i) {
        if (checkBottleName(bottle.name, ingredient.name)) {
          const pourCount = ingredient.serving / bottle.serving;
          alcoholServed += ingredient.serving;
          console.log("Pouring " + bottle.name + " " + pourCount + " times.");

          for (var j = 0; j < pourCount; ++j) {
            var totalPourTimeout = j * pourTimeoutMs;

            if (ingredient.wait > 1) {
              totalPourTimeout =
                totalPourTimeout + ingredient.wait * pourTimeoutMs;
              totalPourCount = ingredient.wait + 1;
            }

            if (totalPourCount < pourCount) {
              totalPourCount = j + 1;
            }

            var openTimeout = 4000;
            var leftOver = pourCount - j;

            if (leftOver < 1) {
              openTimeout = leftOver * openTimeout;
            }
            console.log(bottles);
            setTimeout(() => {
              bottle.capacity = bottle.capacity - bottle.serving;
              openServo(i, openTimeout);
              servoState[i] = true;
              io.emit(socketName, { servos: servoState });
            }, totalPourTimeout);

            setTimeout(() => {
              servoState[i] = false;
              io.emit(socketName, { servos: servoState, bottles: bottles });
              sendBottlesUpdateDashboard();
            }, totalPourTimeout + pourTimeoutMs);
          }
        }
      });
    }
    console.log(servoState);
    const totalPourTime = totalPourCount * pourTimeoutMs;

    setTimeout(() => {
      toggleLed(0);
    }, totalPourTime);

    return totalPourTime;
  } else {
    return 0;
  }
}

// Moving the belt one glass along isn't wired to any hardware yet. Set
// JAMES_BELT_CMD in .env to a shell command that does it; JAMES_BELT_MS is
// how long that move takes (default 3000).
const beltMs = Number(process.env.JAMES_BELT_MS) || 3000;
function advanceBelt() {
  console.log("belt: advance one glass");
  if (process.env.JAMES_BELT_CMD) exec(process.env.JAMES_BELT_CMD);
}

function pourShots(slot) {
  const bottle = bottles[slot];
  const plan = shots.planShots({ slotMs: pourTimeoutMs, beltMs: beltMs });
  var servoState = servos_off();
  toggleLed(1);
  plan.fills.forEach((at) => {
    setTimeout(() => {
      bottle.capacity = bottle.capacity - bottle.serving;
      openServo(slot, 4000);
      servoState[slot] = true;
      io.emit(socketName, { servos: servoState });
    }, at);
    setTimeout(() => {
      servoState[slot] = false;
      io.emit(socketName, { servos: servoState, bottles: bottles });
    }, at + pourTimeoutMs);
  });
  plan.belts.forEach((at) => setTimeout(advanceBelt, at));
  setTimeout(() => toggleLed(0), plan.totalMs);
  return plan.totalMs;
}

function servos_off() {
  return Object.keys(servos).map(() => false);
}

function sendBottlesUpdateDashboard() {
  console.log("sendBottlesUpdateDashboard");
  // set values to metrics object
  gauges.splice(0, gauges.length);
  bottles.map((bottle, i) => {
    let gaugeConfig = {
      id: i,
      title: bottle.name,
      isActive: true,
      type: "gauge",
      mainMetric: Math.round((bottle.capacity * 100) / bottle.originalCapacity),
      mainMetricUnit: "ml",
      metrics: [],
    };
    gauges.push(gaugeConfig);
  });

  metricsData.containers[0].controls = gauges;

  let summary = [
    {
      title: "James Usage Summary",
      items: [
        {
          title: "Drinks served:",
          value: drinksServed,
        },
        { title: "Alcohol poured (ml):", value: alcoholServed },
      ],
    },
  ];
  metricsData.containers[1].controls[0].summaries = summary;
  metricsData.containers[1].controls[0].metrics = drinksSplits;

  // metrics.json is the only thing written here; the cloud sync process reads it.
  fs.writeFileSync(metricsPath, JSON.stringify(metricsData));
}

io.set("origins", "*:*");
io.on("connection", (localSocket) => {
  console.log("a user connected");
  getDrinks(true);
  localSocket.on("disconnect", function () {
    console.log("user disconnected");
  });
});

resetServos();

fs.watchFile(bottlesConfig, (curr, prev) => {
  getDrinks(true);
});

fs.watchFile(recipesConfig, (curr, prev) => {
  getDrinks(true);
});

process.on("uncaughtException", function (err) {
  console.log("WARNING: " + err);
});

getDrinks(true);

http.listen(8000, () => {
  console.log("listening on *:8000");
});

function resetServos() {
  exec('echo "0" > /sys/class/gpio/export');
  exec('echo "out" > /sys/class/gpio/gpio0/direction');

  for (var i = 0; i < Object.keys(servos).length; i++) {
    const servoGpio = servos[i];
    const command =
      'echo "' + servoGpio + '=140" | sudo tee /dev/servoblaster > /dev/null';
    setTimeout(() => {
      exec(command);
    }, 1000 * i);
  }

  io.emit(socketName, { buttonsDisabled: false });
}

function toggleLed(ioValue) {
  exec('echo "' + ioValue + '" > /sys/class/gpio/gpio0/value');
}

function formatRecipes(recipes) {
  let formattedRecipes = {};

  recipes.forEach((recipe) => {
    // garnish and color are optional extras set from the kiosk's admin
    // Recipes tab (what to add by hand after pouring, and an override for
    // the colour the pouring screen / lights use). JSON.stringify drops
    // them again when undefined, so old recipes stay byte-identical.
    formattedRecipes[recipe.name] = {
      friendlyname: recipe.friendlyname,
      ingredients: recipe.ingredients,
      imageUrl: recipe.imageUrl,
      garnish: recipe.garnish,
      color: recipe.color,
    };
  });

  return formattedRecipes;
}

function openServo(servoNumber, openTime) {
  const servoGpio = servos[servoNumber];
  console.log("opening " + servoNumber + " at GPIO " + servoGpio);
  const baseCommand =
    'echo "[SERVO_CMD]" | sudo tee /dev/servoblaster > /dev/null';
  var upCommand = "";
  var upCommand2 = "";
  var downCommand = "";

  if (
    servoNumber == 1 ||
    servoNumber == 3 ||
    servoNumber == 5 ||
    servoNumber == 7
  ) {
    upCommand = baseCommand.replace("[SERVO_CMD]", servoGpio + "=80");
    upCommand2 = baseCommand.replace("[SERVO_CMD]", servoGpio + "=100");
    downCommand = baseCommand.replace("[SERVO_CMD]", servoGpio + "=150");
  } else {
    upCommand = baseCommand.replace("[SERVO_CMD]", servoGpio + "=200");
    upCommand2 = baseCommand.replace("[SERVO_CMD]", servoGpio + "=180");
    downCommand = baseCommand.replace("[SERVO_CMD]", servoGpio + "=130");
  }

  exec(upCommand);

  setTimeout(() => {
    exec(upCommand2);
  }, openTime / 2);
  setTimeout(() => {
    exec(downCommand);
  }, openTime);
}

function checkBottleName(bottleName, ingredientName) {
  return (
    bottleName.replace(" ", "").toUpperCase() ===
    ingredientName.replace(" ", "").toUpperCase()
  );
}

function getDrinks(filterBottles) {
  let drinks = [];

  try {
    let jsonFile = JSON.parse(fs.readFileSync(bottlesConfig));
    bottles = jsonFile;
    recipes = JSON.parse(fs.readFileSync(recipesConfig));

    for (const [key, value] of Object.entries(recipes)) {
      let bottlesPresent = true;
      value.ingredients.forEach((ingredient) => {
        if (
          filterBottles &&
          !!bottles.find(
            (bottle) =>
              checkBottleName(bottle.name, ingredient.name) || ingredient.manual
          ) === false
        ) {
          bottlesPresent = false;
        }
      });

      if (bottlesPresent) {
        drinks.push({
          name: key,
          friendlyname: value.friendlyname,
          ingredients: value.ingredients,
          imageUrl: value.imageUrl,
          garnish: value.garnish,
          color: value.color,
        });
      }
    }

    if (filterBottles) {
      io.emit(socketName, {
        drinks: drinks,
        bottles: bottles,
        buttonsDisabled: false,
      });
    }
  } catch (e) {
    console.log(e);
    console.log("Malformed " + bottlesConfig);
  }

  return drinks;
}
