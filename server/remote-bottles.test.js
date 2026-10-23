const {applyBottleCommands} = require('./remote-bottles');

const available = ['vodka', 'tonic', 'empty'];
const makeBottles = () => [
  {name: 'vodka', serving: '25', capacity: '500', originalCapacity: '700'},
  {name: 'tonic', serving: 50, capacity: 500, originalCapacity: 500},
];

describe('applyBottleCommands', () => {
  it('changes pour size without resetting the fill gauge', () => {
    const bottles = makeBottles();
    const [result] = applyBottleCommands(bottles, available, [
      {id: 1, slot: 0, bottle: {name: 'vodka', capacity: 500, serving: 50}},
    ]);
    expect(result.ok).toBe(true);
    expect(bottles[0]).toEqual({name: 'vodka', serving: 50, capacity: 500, originalCapacity: 700});
  });

  it('treats a capacity change as a refill', () => {
    const bottles = makeBottles();
    applyBottleCommands(bottles, available, [{id: 1, slot: 0, bottle: {name: 'vodka', capacity: 700, serving: 25}}]);
    expect(bottles[0].originalCapacity).toBe(700);
  });

  it('swaps the bottle in a slot, using the canonical name', () => {
    const bottles = makeBottles();
    applyBottleCommands(bottles, available, [{id: 1, slot: 1, bottle: {name: 'EMPTY', capacity: 1000, serving: 50}}]);
    expect(bottles[1]).toEqual({name: 'empty', serving: 50, capacity: 1000, originalCapacity: 1000});
  });

  it('rejects bad input and leaves the bottles untouched', () => {
    const bottles = makeBottles();
    const results = applyBottleCommands(bottles, available, [
      {id: 1, slot: 5, bottle: {name: 'vodka', capacity: 500, serving: 25}},
      {id: 2, slot: 0, bottle: {name: 'rum', capacity: 500, serving: 25}},
      {id: 3, slot: 0, bottle: {name: 'vodka', capacity: 99999, serving: 25}},
      {id: 4, slot: 0, bottle: {name: 'vodka', capacity: 500, serving: 30}},
    ]);
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(results.map((r) => r.error)).toEqual([
      expect.stringMatching(/No such slot/),
      expect.stringMatching(/Unknown bottle/),
      expect.stringMatching(/Capacity/),
      expect.stringMatching(/Pour size/),
    ]);
    expect(bottles).toEqual(makeBottles());
  });
});
