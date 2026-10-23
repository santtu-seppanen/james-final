const {applyCommands} = require('./remote-recipes');

const bottles = [
  {name: 'vodka', serving: 25, capacity: 0},
  {name: 'tonic', serving: 50, capacity: 500},
];

const vodkaTonic = {friendlyname: 'Vodka & Tonic', ingredients: [{name: 'Vodka', serving: 50}, {name: 'tonic', serving: 100}]};

describe('applyCommands', () => {
  it('adds a new recipe, normalizing bottle names and defaulting the image', () => {
    const recipes = {};
    const [result] = applyCommands(recipes, bottles, [{id: 1, op: 'upsert', recipe: vodkaTonic}]);
    expect(result).toEqual({id: 1, ok: true});
    const saved = Object.values(recipes)[0];
    expect(saved.ingredients[0].name).toBe('vodka');
    expect(saved.imageUrl).toBe('humppaleka');
  });

  it('keeps the existing image when editing', () => {
    const recipes = {abc: {friendlyname: 'Old', ingredients: [], imageUrl: 'gin_tonic'}};
    applyCommands(recipes, bottles, [{id: 1, op: 'upsert', recipeId: 'abc', recipe: vodkaTonic}]);
    expect(recipes.abc.imageUrl).toBe('gin_tonic');
    expect(recipes.abc.friendlyname).toBe('Vodka & Tonic');
  });

  it('allows saving with an empty bottle', () => {
    const recipes = {};
    const [result] = applyCommands(recipes, bottles, [{id: 1, op: 'upsert', recipe: vodkaTonic}]);
    expect(result.ok).toBe(true);
  });

  it('rejects unknown bottles and bad serving multiples without touching recipes', () => {
    const recipes = {};
    const results = applyCommands(recipes, bottles, [
      {id: 1, op: 'upsert', recipe: {friendlyname: 'X', ingredients: [{name: 'rum', serving: 25}]}},
      {id: 2, op: 'upsert', recipe: {friendlyname: 'X', ingredients: [{name: 'vodka', serving: 30}]}},
    ]);
    expect(results[0].error).toMatch(/Unknown bottle/);
    expect(results[1].error).toMatch(/multiple of 25/);
    expect(recipes).toEqual({});
  });

  it('deletes a recipe and reports a missing one', () => {
    const recipes = {abc: {friendlyname: 'Old', ingredients: []}};
    const results = applyCommands(recipes, bottles, [
      {id: 1, op: 'delete', recipeId: 'abc'},
      {id: 2, op: 'delete', recipeId: 'abc'},
    ]);
    expect(results.map((r) => r.ok)).toEqual([true, false]);
    expect(recipes).toEqual({});
  });
});
