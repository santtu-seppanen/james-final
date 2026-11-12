const {SHOT_COUNT, planShots, shotBottles} = require('./shots');

describe('planShots', () => {
  test('fills five glasses with the belt moving between them', () => {
    const plan = planShots({slotMs: 8000, beltMs: 3000});
    expect(SHOT_COUNT).toBe(5);
    expect(plan.fills).toEqual([0, 11000, 22000, 33000, 44000]);
    expect(plan.belts).toEqual([8000, 19000, 30000, 41000]);
    expect(plan.totalMs).toBe(5 * 8000 + 4 * 3000);
  });

  test('never moves the belt after the last glass', () => {
    const plan = planShots({slotMs: 1000, beltMs: 500, count: 3});
    expect(plan.belts.length).toBe(2);
    expect(plan.totalMs).toBe(3 * 1000 + 2 * 500);
  });
});

describe('shotBottles', () => {
  const bottles = [
    {name: 'vodka', serving: 25, capacity: 700},
    {name: 'cranberry', serving: '50', capacity: '1000'},
    {name: 'empty', serving: 25, capacity: 1000},
    {name: 'gin', serving: '25', capacity: '125'},
    {name: 'rum', serving: 25, capacity: 100}, // too little for five
    {name: 'tequila', serving: 25, capacity: 124}, // one ml short
  ];

  test('keeps only loaded 25 ml bottles with room for every glass', () => {
    expect(shotBottles(bottles).map((s) => s.bottle.name)).toEqual(['vodka', 'gin']);
  });

  test('reports the servo slot', () => {
    expect(shotBottles(bottles).map((s) => s.slot)).toEqual([0, 3]);
  });
});
