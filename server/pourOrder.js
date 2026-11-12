// The order and timing of a drink pour: one ingredient at a time, spirits
// first and the juices on top, so the lighter mixer ends up mixing the spirit
// as it goes in. Fizzy mixers (manual) aren't poured by the machine at all.
//
// Timing only - no servos, no timers - so it can be tested on its own.
// Node 10-compatible syntax on purpose (the Pi runs Node 10).
var SPIRIT = /^(vodka|gin|rum|whisk(e)?y|tequila|jaloviina|bols|carillo|brandy|cognac|vermouth|liqueur|campari|aperol)\b/i;

function isSpirit(name) {
  return SPIRIT.test(String(name).trim());
}

// Spirits first, everything else after; the recipe's own order is kept
// inside each group.
function pourOrder(ingredients) {
  var spirits = ingredients.filter(function (ing) {
    return isSpirit(ing.name);
  });
  var rest = ingredients.filter(function (ing) {
    return !isSpirit(ing.name);
  });
  return spirits.concat(rest);
}

function sameBottle(bottleName, ingredientName) {
  return String(bottleName).replace(' ', '').toUpperCase() === String(ingredientName).replace(' ', '').toUpperCase();
}

// Returns {steps: [{slot, pours, startSlot}], totalSlots}. A "slot" is one
// pour time; ingredient k starts when the one before it has finished, so no
// two bottles are ever open at once.
function planPour(ingredients, bottles) {
  var steps = [];
  var cursor = 0;
  pourOrder(ingredients).forEach(function (ing) {
    if (ing.manual) return;
    var slot = -1;
    bottles.forEach(function (bottle, i) {
      if (slot < 0 && sameBottle(bottle.name, ing.name)) slot = i;
    });
    if (slot < 0) return;
    var pours = ing.serving / bottles[slot].serving;
    steps.push({slot: slot, pours: pours, startSlot: cursor});
    cursor += Math.ceil(pours);
  });
  return {steps: steps, totalSlots: Math.max(cursor, 1)};
}

module.exports = {isSpirit: isSpirit, pourOrder: pourOrder, planPour: planPour};
