const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(failSecond = false) {
  const registered = new Set(['user-owned.css']);
  const service = {
    USER_SHEET: 1,
    sheetRegistered: uri => registered.has(uri),
    loadAndRegisterSheet(uri, type) {
      assert.equal(type, 1);
      if (failSecond && uri.includes('content.css')) throw Error('load failed');
      registered.add(uri);
    },
    unregisterSheet(uri, type) { assert.equal(type, 1); registered.delete(uri); },
  };
  const scope = { ExtensionCommon: {ExtensionAPI: class {}},
    Cc: {'@mozilla.org/content/style-sheet-service;1': {getService: () => service}},
    Ci: {nsIStyleSheetService: {}}, Services: {io: {newURI: value => value}},
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../experiment/api.js'),'utf8'), scope);
  const api = new scope.LimeCards();
  api.extension = {getURL: name => 'moz-extension://test/' + name, manifest: {version:'0.3.0'}};
  return {api, registered};
}

test('packaged styling is reversible and never unregisters user styles', () => {
  const {api, registered} = fixture();
  assert.equal(typeof api.loadStyles, 'function');
  api.loadStyles(); api.loadStyles();
  assert.equal(registered.size, 3);
  for (const uri of [...registered].filter(x => x.startsWith('moz-extension:'))) {
    assert(fs.existsSync(path.join(__dirname,'..',uri.split('/test/')[1].split('?')[0])));
  }
  api.unloadStyles(); api.unloadStyles();
  assert.deepEqual([...registered], ['user-owned.css']);
});

test('partial style failure rolls back the first sheet', () => {
  const {api, registered} = fixture(true);
  assert.equal(typeof api.loadStyles, 'function');
  assert.throws(() => api.loadStyles(), /load failed/);
  assert.deepEqual([...registered], ['user-owned.css']);
});
