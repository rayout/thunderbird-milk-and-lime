const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scope = {};
const file = path.join(__dirname, '../experiment/tags.js');
if (fs.existsSync(file)) vm.runInNewContext(fs.readFileSync(file, 'utf8'), scope);

test('tag controller disposal is safe before any message row exists', () => {
  assert.equal(typeof scope.LimeTags?.create, 'function');
  const controller = scope.LimeTags.create({document: {}}, {tagService: {}, label: '+ Метка'});
  controller.remove({});
  controller.dispose();
  controller.dispose();
});
