// jest's moduleFileExtensions here doesn't include .cjs, so requiring
// nanoid/non-secure/index.cjs - even from inside this shim - resolves
// incorrectly under jest (though it works fine under plain Node). This
// re-implements nanoid's tiny non-secure generator directly instead of
// trying to load that file, sidestepping the extension issue entirely.
// See ui/package.json's jest.moduleNameMapper entry for "nanoid/non-secure".
var urlAlphabet =
  'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

function customAlphabet(alphabet, defaultSize) {
  defaultSize = defaultSize || 21;
  return function (size) {
    size = size || defaultSize;
    var id = '';
    var i = size | 0;
    while (i-- > 0) {
      id += alphabet[(Math.random() * alphabet.length) | 0];
    }
    return id;
  };
}

function nanoid(size) {
  size = size || 21;
  var id = '';
  var i = size | 0;
  while (i-- > 0) {
    id += urlAlphabet[(Math.random() * 64) | 0];
  }
  return id;
}

module.exports = {nanoid: nanoid, customAlphabet: customAlphabet};
