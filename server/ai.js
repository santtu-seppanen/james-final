// AI drink generation, talking to the Anthropic API directly over HTTPS
// (via node-fetch) rather than the official @anthropic-ai/sdk - the SDK
// targets modern Node, and the Pi runs Node 10. Written in Node
// 10-compatible syntax for the same reason (see reporter.js).
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
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            name: {type: 'string', description: 'Must exactly match one of the given bottle names.'},
            serving: {
              type: 'integer',
              description: "Total ml of this ingredient - must be a positive multiple of that bottle's own serving size.",
            },
          },
          required: ['name', 'serving'],
        },
      },
    },
    required: ['friendlyname', 'ingredients'],
  },
};

function buildPrompt(bottles) {
  var lines = bottles.map(function (b) {
    return '- ' + b.name + ': ' + b.capacity + 'ml left, poured in ' + b.serving + 'ml shots';
  });
  return (
    'You are a bartender robot. Here are the bottles currently loaded, with how much is left ' +
    'and the fixed shot size each one pours in:\n\n' +
    lines.join('\n') +
    '\n\nPropose one new cocktail using 2-4 of these bottles. Each ingredient amount must be a ' +
    "whole multiple of that bottle's own shot size, and must not exceed what's left in the bottle. " +
    'Use the propose_drink tool to answer - no other text.'
  );
}

function validateRecipe(recipe, bottlesByName) {
  if (!recipe || typeof recipe.friendlyname !== 'string' || !recipe.friendlyname.trim()) {
    return 'Missing friendlyname';
  }
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length < 1) {
    return 'Missing ingredients';
  }

  var seen = {};
  for (var i = 0; i < recipe.ingredients.length; i++) {
    var ing = recipe.ingredients[i];
    var bottle = bottlesByName[String(ing.name).toUpperCase()];

    if (!bottle) {
      return 'Unknown bottle: ' + ing.name;
    }
    if (seen[bottle.name]) {
      return 'Duplicate ingredient: ' + ing.name;
    }
    seen[bottle.name] = true;

    var serving = Number(ing.serving);
    var unit = Number(bottle.serving);
    if (!serving || serving <= 0 || serving % unit !== 0) {
      return ing.name + ': serving must be a multiple of ' + unit + 'ml';
    }
    if (serving > Number(bottle.capacity)) {
      return ing.name + ': not enough left (' + bottle.capacity + 'ml)';
    }
  }

  return null;
}

// bottles: array from bottles_config.json. Returns a Promise resolving to
// {friendlyname, ingredients: [{name, serving}]} or rejecting with an Error.
function generateDrink(allBottles) {
  if (!ANTHROPIC_API_KEY) {
    return Promise.reject(new Error('ANTHROPIC_API_KEY not set'));
  }

  // "empty" is the placeholder for an unused slot, and a dry bottle can't pour.
  var bottles = allBottles.filter(function (b) {
    return String(b.name).toLowerCase() !== 'empty' && Number(b.capacity) > 0;
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
      messages: [{role: 'user', content: buildPrompt(bottles)}],
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
      var validationError = validateRecipe(recipe, bottlesByName);
      if (validationError) {
        throw new Error('Invalid AI recipe: ' + validationError);
      }

      // Normalize to exactly matching bottle names/casing and plain numbers.
      recipe.ingredients = recipe.ingredients.map(function (ing) {
        var bottle = bottlesByName[String(ing.name).toUpperCase()];
        return {name: bottle.name, serving: Number(ing.serving)};
      });

      return recipe;
    });
}

module.exports = {generateDrink: generateDrink, validateRecipe: validateRecipe};
