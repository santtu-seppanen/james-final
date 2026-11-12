const {isSpirit, pourOrder, planPour} = require('./pourOrder');

const bottles = [
  {name: 'cranberry', serving: 50},
  {name: 'vodka', serving: 25},
  {name: 'sprite', serving: 50},
];

describe('pourOrder', () => {
  it('knows spirits, not ginger beer', () => {
    expect(isSpirit('Vodka')).toBe(true);
    expect(isSpirit('gin')).toBe(true);
    expect(isSpirit('ginger beer')).toBe(false);
    expect(isSpirit('cranberry')).toBe(false);
  });

  it('puts spirits first and keeps the recipe order inside each group', () => {
    const names = pourOrder([{name: 'cranberry'}, {name: 'vodka'}, {name: 'orangejuice'}, {name: 'rum'}]).map((i) => i.name);
    expect(names).toEqual(['vodka', 'rum', 'cranberry', 'orangejuice']);
  });
});

describe('planPour', () => {
  it('pours one ingredient at a time, spirit first', () => {
    const plan = planPour([{name: 'cranberry', serving: 100}, {name: 'vodka', serving: 50}], bottles);
    expect(plan.steps).toEqual([
      {slot: 1, pours: 2, startSlot: 0},
      {slot: 0, pours: 2, startSlot: 2},
    ]);
    expect(plan.totalSlots).toBe(4);
  });

  it('leaves out by-hand ingredients, even when a bottle of it is loaded', () => {
    const plan = planPour([{name: 'vodka', serving: 25}, {name: 'sprite', serving: 100, manual: true}], bottles);
    expect(plan.steps).toHaveLength(1);
    expect(plan.totalSlots).toBe(1);
  });

  it('counts a part shot as a whole slot and never plans zero', () => {
    expect(planPour([{name: 'vodka', serving: 10}], bottles).totalSlots).toBe(1);
    expect(planPour([], bottles).totalSlots).toBe(1);
  });
});
