// Applies recipe edits queued from the public dashboard (see
// cloudflare/functions/api/admin/recipes.js) to recipes_config.json.
// Called from reporter.js, which polls for pending commands.
//
// Every command is validated here, on the Pi, regardless of what the
// Cloudflare side already checked - the queue is internet-facing.
//
// Node 10-compatible syntax on purpose (see reporter.js).

var DEFAULT_IMAGE = 'humppaleka';

function validateRecipe(recipe, bottlesByName) {
  if (!recipe || typeof recipe.friendlyname !== 'string' || !recipe.friendlyname.trim()) {
    return 'Missing friendlyname';
  }
  if (recipe.friendlyname.length > 60) {
    return 'Name too long';
  }
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length < 1) {
    return 'Missing ingredients';
  }

  var seen = {};
  for (var i = 0; i < recipe.ingredients.length; i++) {
    var ing = recipe.ingredients[i];
    var bottle = ing && bottlesByName[String(ing.name).toUpperCase()];
    if (!bottle) {
      return 'Unknown bottle: ' + (ing && ing.name);
    }
    if (seen[bottle.name]) {
      return 'Duplicate ingredient: ' + ing.name;
    }
    seen[bottle.name] = true;

    var serving = Number(ing.serving);
    var unit = Number(bottle.serving);
    if (!serving || serving <= 0 || serving % unit !== 0) {
      return bottle.name + ': serving must be a multiple of ' + unit + 'ml';
    }
  }
  return null;
}

// recipes: object from recipes_config.json (mutated). bottles: array from
// bottles_config.json. commands: [{id, op: 'upsert'|'delete', recipeId,
// recipe: {friendlyname, ingredients}}]. Returns [{id, ok, error?}].
function applyCommands(recipes, bottles, commands) {
  var bottlesByName = {};
  bottles.forEach(function (b) {
    bottlesByName[String(b.name).toUpperCase()] = b;
  });

  return commands.map(function (cmd) {
    if (cmd.op === 'delete') {
      if (!recipes[cmd.recipeId]) {
        return {id: cmd.id, ok: false, error: 'No such recipe'};
      }
      delete recipes[cmd.recipeId];
      return {id: cmd.id, ok: true};
    }

    if (cmd.op !== 'upsert') {
      return {id: cmd.id, ok: false, error: 'Unknown op: ' + cmd.op};
    }

    var error = validateRecipe(cmd.recipe, bottlesByName);
    if (error) {
      return {id: cmd.id, ok: false, error: error};
    }

    var existing = cmd.recipeId ? recipes[cmd.recipeId] : null;
    if (cmd.recipeId && !existing) {
      return {id: cmd.id, ok: false, error: 'No such recipe'};
    }

    // Same id scheme as /api/save-recipe in index.js; the counter keeps two
    // commands applied in the same millisecond from colliding.
    var id = cmd.recipeId || String(Date.now()) + String(Object.keys(recipes).length);
    recipes[id] = {
      friendlyname: cmd.recipe.friendlyname.trim(),
      // Normalize to the bottles' own casing and plain numbers.
      ingredients: cmd.recipe.ingredients.map(function (ing) {
        return {name: bottlesByName[String(ing.name).toUpperCase()].name, serving: Number(ing.serving)};
      }),
      imageUrl: (existing && existing.imageUrl) || DEFAULT_IMAGE,
    };
    return {id: cmd.id, ok: true};
  });
}

module.exports = {applyCommands: applyCommands, validateRecipe: validateRecipe};
