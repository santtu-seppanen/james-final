const express = require("express");
const app = express();
var http = require("http").createServer(app);
var io = require("socket.io")(http);
var cors = require("cors");
var fs = require("fs");
var AWS = require("aws-sdk");
var exec = require("child_process").exec;
const recipesConfig = "./recipes_config.json";
const servos = require("./servos_config.json");
const metricsPath = "./metrics.json";
const pourTimeoutMs = 8000;
const bottlesConfig = "./bottles_config.json";
const availableBottlesConfig = "./available_bottles_config.json";
const cron = require("cron");
const { networkInterfaces } = require("os");
const nets = networkInterfaces();
var bottles = [];
var recipes = {};
const socketName = "servoState";
const WebSocket = require("ws");
let socket = null;
// ****** Metrics variables ******
const gauges = [];
let metricsData = null;
let drinksServed = 0;
let alcoholServed = 0;
let drinksSplits = [];
let connectionAlive = false;

require("dotenv").config();

// Infra endpoints come from the environment so they're not sitting in a
// public repo's git history. See .env.example.
const WS_ENDPOINT = process.env.JAMES_WS_ENDPOINT;
const S3_BUCKET = process.env.JAMES_S3_BUCKET;

const openWSConnection = () => {
  socket = new WebSocket(WS_ENDPOINT);

  setTimeout(() => {
    console.log("Socket open");
    socket.send(
      JSON.stringify({
        action: "register",
        data: { application: "james", origin: "server" },
      })
    );
    connectionAlive = true;
  }, 1500);

  socket.onmessage = function (event) {
    console.log(event.data);
    let jsonData = JSON.parse(event.data);
    if (jsonData.testConnection && jsonData.origin === "server") {
      connectionAlive = true;
    } else if (
      jsonData.application === "james" &&
      jsonData.origin === "client"
    ) {
      console.log("Sending initial data...");
      metricsData.origin = "server";
      socket.send(
        JSON.stringify({
          action: "sendmessage",
          data: metricsData,
          directConnectionId: jsonData.connectionId,
          origin: "server",
        })
      );
    }
    else if (jsonData.origin === "Alexa") {
      let drinks = getDrinks(true);
      console.log(drinks);
      let drinkAvailable = false;
      const drinkName = jsonData.drinkName;

      for (var item in drinks){

        var name = drinks[item].name;

        if (name == drinkName) {
            drinkAvailable = true;
        }
      }

      if (drinkAvailable){
        const totalPourTime = pourDrink(drinkName);
        if (totalPourTime == 0) {
          console.log(
            drinkName + " not found! Total pour time: " + totalPourTime
          );
        } else {
          console.log(
            "Pouring " + drinkName + ". Total pour time: " + totalPourTime
          );
        }
      }
      else {
        console.log("Something missing, drink is not available");
      }
    }
  };

  metricsData = JSON.parse(fs.readFileSync(metricsPath));
};

// middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
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
  const totalPourTime = pourDrink(req.body.drink);
  if (totalPourTime == 0) {
    res.json(JSON.stringify({ success: false, pourTime: totalPourTime }));
  } else {
    res.json(JSON.stringify({ success: true, pourTime: totalPourTime }));
  }
});

function pourDrink(drinkName) {
  toggleLed(1);
  var servoState = [false, false, false, false, false, false, false, false];

  const recipes = JSON.parse(fs.readFileSync(recipesConfig));
  const recipe = recipes[drinkName];
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
  console.log("Sending data...");
  socket.send(JSON.stringify({ action: "sendmessage", data: metricsData }));

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

process.on("SIGTERM", () => {
  console.log("Killing");
  if (socket != null) {
    socket.send(JSON.stringify({ action: "unregister" }));
    socket.close();
  }
});

process.on("SIGINT", () => {
  console.log("Killing");
  console.log("Unregister");
  if (socket != null) {
    socket.send(JSON.stringify({ action: "unregister" }));
    socket.close();
  }
  process.exit(0);
});

process.on("uncaughtException", function (err) {
  console.log("WARNING: " + err);
});

getDrinks(true);

var cronJob = cron.job("0 */5 * * * *", function () {
  if (connectionAlive) {
    connectionAlive = false;
    console.log("Ping socket connection.");
    socket.send(
      //Just keepalive for server..
      JSON.stringify({
        action: "sendmessage",
        testConnection: true,
        data: { origin: "server" },
      })
    );
  } else {
    console.log("Reconnecting");
    openWSConnection();
  }
});

cronJob.start();
openWSConnection();

http.listen(8000, () => {
  console.log("listening on *:8000");
});

function resetServos() {
  exec('echo "0" > /sys/class/gpio/export');
  exec('echo "out" > /sys/class/gpio/gpio0/direction');

  for (var i = 0; i < 8; i++) {
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
    formattedRecipes[recipe.name] = {
      friendlyname: recipe.friendlyname,
      ingredients: recipe.ingredients,
      imageUrl: recipe.imageUrl,
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

  syncToS3(drinks);

  return drinks;
}

function syncToS3(availableDrinks) {
  const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });

  const params = {
    Bucket: S3_BUCKET,
    Key: "available-recipes.json",
    Body: JSON.stringify(availableDrinks),
  };

  s3.upload(params, (err, data) => {
    if (err) {
      console.log(err);
    }
    console.log(data.Location);
  });
}
