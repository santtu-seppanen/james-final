// AI drink generation, talking to the Anthropic API directly over HTTPS
// (via node-fetch) rather than the official @anthropic-ai/sdk - the SDK
// targets modern Node, and the Pi runs Node 10. Written in Node
// 10-compatible syntax for the same reason (the Pi runs Node 10).
var fetch = require('node-fetch');

var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
var MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

var PROPOSE_DRINK_TOOL = {
  name: 'propose_drink',
  description:
    'Propose one new cocktail recipe that can actually be poured right now, using only the listed bottles.',
  input_schema: {
    type: 'object',
    properties: {
      friendlyname: {
        type: 'string',
        description: 'A short, fun name for the drink.',
      },
      ingredients: {
        type: 'array',
        minItems: 2,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            name: {type: 'string', description: 'Must exactly match one of the given bottle names, unless it is a fizzy mixer added by hand.'},
            serving: {
              type: 'integer',
              description:
                "Total ml of this ingredient - for a bottle, a positive multiple of that bottle's own serving size; for a fizzy mixer, any multiple of 10.",
            },
            manual: {
              type: 'boolean',
              description: 'true for a fizzy mixer (soda, tonic, cola, lemonade...) that the guest pours by hand.',
            },
          },
          required: ['name', 'serving'],
        },
      },
    },
    required: ['friendlyname', 'ingredients'],
  },
};

// Soda, tonic, cola and the like are never poured by the machine: the guest
// tops the glass up by hand so the fizz isn't shaken flat in the tubes.
var FIZZY = /soda|tonic|sprite|cola|coke|pepsi|fanta|7up|lemonade|ginger ?(ale|beer)|fizz|sparkl|bubbl|limsa|vissy|kupliva|seltzer|mineral water/i;

function isFizzy(name) {
  return FIZZY.test(String(name));
}

var STYLES = [
  'a tall, refreshing long drink',
  'something sweet and fruity',
  'a sour, zesty drink',
  'a strong, spirit-forward drink',
  'a light, easy-drinking party drink',
  'something unexpected and a bit weird',
  'a summery drink',
  'a drink you would find at a late-night bar',
];

function shuffle(items, rand) {
  var a = items.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(rand() * (i + 1));
    var tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

// The same bottles in the same order would get (nearly) the same answer
// every time, so each request gets a shuffled bottle list, a random style and
// a random bottle to build around, plus the names of drinks already on the
// menu to steer away from. rand is injectable for tests.
function buildPrompt(bottles, existingNames, rand) {
  rand = rand || Math.random;
  var shuffled = shuffle(bottles, rand);
  var lines = shuffled.map(function (b) {
    return '- ' + b.name + ': ' + b.capacity + 'ml left, poured in ' + b.serving + 'ml shots';
  });
  var style = STYLES[Math.floor(rand() * STYLES.length)];
  var featured = shuffled[0].name;

  var prompt =
    'You are a bartender robot. Here are the bottles currently loaded, with how much is left ' +
    'and the fixed shot size each one pours in:\n\n' +
    lines.join('\n') +
    '\n\nPropose one new cocktail using 2-4 of these bottles. Each ingredient amount must be a ' +
    "whole multiple of that bottle's own shot size, and must not exceed what's left in the bottle. " +
    'Make it ' + style + ', and build it around ' + featured + '. ' +
    'Fizzy mixers (soda, tonic, cola, lemonade, ginger beer, sparkling water) are never poured by the ' +
    'machine: you may add one of them, any amount that is a multiple of 10 ml, marked manual: true. ' +
    'It does not have to be in the bottle list. Every other ingredient must be a bottle from the list.';

  if (existingNames && existingNames.length > 0) {
    prompt += ' These drinks are already on the menu, so do not suggest them or close variants: ' +
      existingNames.join(', ') + '.';
  }

  return prompt + ' Use the propose_drink tool to answer - no other text.';
}

function validateRecipe(recipe, bottlesByName) {
  if (!recipe || typeof recipe.friendlyname !== 'string' || !recipe.friendlyname.trim()) {
    return 'Missing friendlyname';
  }
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length < 1) {
    return 'Missing ingredients';
  }

  var seen = {};
  var machineIngredients = 0;
  for (var i = 0; i < recipe.ingredients.length; i++) {
    var ing = recipe.ingredients[i];
    var key = String(ing.name).toUpperCase();
    var serving = Number(ing.serving);

    if (seen[key]) {
      return 'Duplicate ingredient: ' + ing.name;
    }
    seen[key] = true;

    // Poured by hand: no bottle to check, any sensible amount.
    if (ing.manual) {
      if (!serving || serving <= 0) {
        return ing.name + ': serving must be positive';
      }
      continue;
    }

    var bottle = bottlesByName[key];
    if (!bottle) {
      return 'Unknown bottle: ' + ing.name;
    }
    machineIngredients++;

    var unit = Number(bottle.serving);
    if (!serving || serving <= 0 || serving % unit !== 0) {
      return ing.name + ': serving must be a multiple of ' + unit + 'ml';
    }
    if (serving > Number(bottle.capacity)) {
      return ing.name + ': not enough left (' + bottle.capacity + 'ml)';
    }
  }
  if (machineIngredients === 0) {
    return 'Needs at least one bottle ingredient';
  }

  return null;
}

// bottles: array from bottles_config.json. existingNames: friendly names of
// the drinks already on the menu (optional). Returns a Promise resolving to
// {friendlyname, ingredients: [{name, serving}]} or rejecting with an Error.
function generateDrink(allBottles, existingNames) {
  if (!ANTHROPIC_API_KEY) {
    return Promise.reject(new Error('ANTHROPIC_API_KEY not set'));
  }

  // "empty" is the placeholder for an unused slot, and a dry bottle can't pour.
  var bottles = allBottles.filter(function (b) {
    return String(b.name).toLowerCase() !== 'empty' && Number(b.capacity) > 0 && !isFizzy(b.name);
  });
  if (bottles.length < 2) {
    return Promise.reject(new Error('Need at least two loaded bottles'));
  }

  var bottlesByName = {};
  bottles.forEach(function (b) {
    bottlesByName[String(b.name).toUpperCase()] = b;
  });

  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      tools: [PROPOSE_DRINK_TOOL],
      tool_choice: {type: 'tool', name: 'propose_drink'},
      messages: [{role: 'user', content: buildPrompt(bottles, existingNames)}],
    }),
  })
    .then(function (response) {
      if (!response.ok) {
        return response.text().then(function (text) {
          throw new Error('Anthropic API error ' + response.status + ': ' + text);
        });
      }
      return response.json();
    })
    .then(function (data) {
      var toolUse = (data.content || []).filter(function (block) {
        return block.type === 'tool_use' && block.name === 'propose_drink';
      })[0];

      if (!toolUse) {
        throw new Error('Model did not return a propose_drink tool call');
      }

      var recipe = toolUse.input;
      (recipe.ingredients || []).forEach(function (ing) {
        if (isFizzy(ing.name)) ing.manual = true;
      });
      var validationError = validateRecipe(recipe, bottlesByName);
      if (validationError) {
        throw new Error('Invalid AI recipe: ' + validationError);
      }

      // Normalize to exactly matching bottle names/casing and plain numbers.
      // Anything fizzy is by hand, whatever the model said.
      recipe.ingredients = recipe.ingredients.map(function (ing) {
        var bottle = bottlesByName[String(ing.name).toUpperCase()];
        if (ing.manual || isFizzy(ing.name)) {
          return {name: String(ing.name).toLowerCase().trim(), serving: Number(ing.serving), manual: true};
        }
        return {name: bottle.name, serving: Number(ing.serving)};
      });

      return recipe;
    });
}

module.exports = {
  generateDrink: generateDrink,
  validateRecipe: validateRecipe,
  buildPrompt: buildPrompt,
  isFizzy: isFizzy,
};
