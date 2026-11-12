// Shot mode ("5 viinaa"): the conveyor carries five shot glasses instead of
// one glass, and the belt fills them one at a time from a single bottle.
//
// planShots() is the timing only - no servos, no timers - so it can be
// tested on its own. The pour itself reuses the servo code in index.js.
//
// Node 10-compatible syntax on purpose (the Pi runs Node 10).
var SHOT_COUNT = 5;

// Glass k is filled at k * (slotMs + beltMs); the belt then moves one glass
// along (beltMs) before the next fill, except after the last glass.
// Returns {fills: [ms...], belts: [ms...], totalMs}.
function planShots(options) {
  var slotMs = options.slotMs;
  var beltMs = options.beltMs;
  var count = options.count || SHOT_COUNT;
  var fills = [];
  var belts = [];
  for (var k = 0; k < count; k++) {
    var start = k * (slotMs + beltMs);
    fills.push(start);
    if (k < count - 1) belts.push(start + slotMs);
  }
  return {fills: fills, belts: belts, totalMs: count * slotMs + (count - 1) * beltMs};
}

// Bottles that can be poured as shots: a single 25 ml serving each, loaded,
// and with enough left for all the glasses. Returns [{slot, bottle}].
function shotBottles(bottles, count) {
  var list = [];
  (bottles || []).forEach(function (bottle, slot) {
    var serving = Number(bottle.serving);
    var capacity = Number(bottle.capacity);
    if (serving !== 25) return;
    if (String(bottle.name).toLowerCase() === 'empty') return;
    if (!(capacity >= serving * (count || SHOT_COUNT))) return;
    list.push({slot: slot, bottle: bottle});
  });
  return list;
}

module.exports = {SHOT_COUNT: SHOT_COUNT, planShots: planShots, shotBottles: shotBottles};
