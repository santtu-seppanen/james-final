const {validateRecipe, buildPrompt} = require('./ai');

const bottlesByName = {
  VODKA: {name: 'vodka', capacity: 500, serving: 25},
  TONIC: {name: 'tonic', capacity: 500, serving: 50},
  CRANBERRY: {name: 'cranberry', capacity: 100, serving: 50},
};

describe('validateRecipe', () => {
  it('accepts a valid recipe using known bottles and their serving multiples', () => {
    const recipe = {
      friendlyname: 'Test Drink',
      ingredients: [
        {name: 'vodka', serving: 50},
        {name: 'tonic', serving: 100},
      ],
    };
    expect(validateRecipe(recipe, bottlesByName)).toBeNull();
  });

  it('rejects an unknown bottle name', () => {
    const recipe = {
      friendlyname: 'Test Drink',
      ingredients: [{name: 'whiskey', serving: 25}],
    };
    expect(validateRecipe(recipe, bottlesByName)).toMatch(/Unknown bottle/);
  });

  it('rejects a serving that is not a multiple of the bottle unit', () => {
    const recipe = {
      friendlyname: 'Test Drink',
      ingredients: [{name: 'vodka', serving: 30}],
    };
    expect(validateRecipe(recipe, bottlesByName)).toMatch(/multiple of/);
  });

  it('rejects a serving that exceeds remaining capacity', () => {
    const recipe = {
      friendlyname: 'Test Drink',
      ingredients: [{name: 'cranberry', serving: 150}],
    };
    expect(validateRecipe(recipe, bottlesByName)).toMatch(/not enough left/);
  });

  it('rejects duplicate ingredients', () => {
    const recipe = {
      friendlyname: 'Test Drink',
      ingredients: [
        {name: 'vodka', serving: 25},
        {name: 'VODKA', serving: 25},
      ],
    };
    expect(validateRecipe(recipe, bottlesByName)).toMatch(/Duplicate/);
  });

  it('rejects a missing friendlyname', () => {
    const recipe = {ingredients: [{name: 'vodka', serving: 25}]};
    expect(validateRecipe(recipe, bottlesByName)).toMatch(/friendlyname/);
  });

  it('rejects empty ingredients', () => {
    const recipe = {friendlyname: 'Test Drink', ingredients: []};
    expect(validateRecipe(recipe, bottlesByName)).toMatch(/ingredients/);
  });
});

describe('buildPrompt', () => {
  const bottles = [
    {name: 'vodka', capacity: 500, serving: 25},
    {name: 'tonic', capacity: 500, serving: 50},
    {name: 'cranberry', capacity: 100, serving: 50},
  ];

  // Deterministic stand-in for Math.random: cycles through the given values.
  const seq = (...values) => {
    let i = 0;
    return () => values[i++ % values.length];
  };

  it('lists existing drinks to avoid', () => {
    const prompt = buildPrompt(bottles, ['Moukku', 'Sea Breeze'], seq(0.5));
    expect(prompt).toMatch(/already on the menu.*Moukku, Sea Breeze/);
  });

  it('varies with the random source so repeat requests differ', () => {
    const a = buildPrompt(bottles, [], seq(0.0, 0.0, 0.0));
    const b = buildPrompt(bottles, [], seq(0.9, 0.9, 0.9));
    expect(a).not.toEqual(b);
  });

  it('still mentions every bottle', () => {
    const prompt = buildPrompt(bottles, [], seq(0.3));
    bottles.forEach((b) => expect(prompt).toContain('- ' + b.name + ':'));
  });
});
