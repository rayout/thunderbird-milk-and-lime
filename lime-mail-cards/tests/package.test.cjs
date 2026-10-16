const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('install contract references packaged scripts and bilingual metadata', () => {
  assert(fs.existsSync(path.join(root, 'manifest.json')), 'manifest exists');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.match(manifest.browser_specific_settings.gecko.id, /^\{[\da-f-]{36}\}$/);
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, '157.0');
  assert.equal(manifest.browser_specific_settings.gecko.strict_max_version, '157.*');
  assert.equal(manifest.default_locale, 'en');
  assert.equal(manifest.manifest_version, 2);
  assert.deepEqual(manifest.permissions || [], ['storage','https://icons.duckduckgo.com/*']);
  assert(fs.existsSync(path.join(root, manifest.options_ui.page)));
  const api = manifest.experiment_apis.LimeCards;
  for (const file of [...manifest.background.scripts, api.schema, api.parent.script]) {
    assert(fs.existsSync(path.join(root, file)), file);
  }
  const en = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json')));
  const ru = JSON.parse(fs.readFileSync(path.join(root, '_locales/ru/messages.json')));
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ru).sort());
  for (const text of [manifest.name, manifest.description]) {
    assert(en[text.match(/^__MSG_(.+)__$/)[1]].message);
  }
  assert(en.missingPreview.message && ru.missingPreview.message);
  const schema = JSON.parse(fs.readFileSync(path.join(root, api.schema)));
  assert.equal(schema[0].namespace, 'LimeCards');
  assert.equal(schema[0].functions[0].name, 'start');
});
test('built XPI contains exactly the runtime files, byte for byte', {skip:!process.env.XPI_FILE}, () => {
  const {execFileSync}=require('node:child_process');
  const expected=['manifest.json','avatars.js','background.js','options.html','options.js','experiment/api.js','experiment/cards.js','experiment/cards.css','experiment/tags.js','experiment/threads.js','experiment/schema.json','styles/interface.css','styles/content.css','_locales/en/messages.json','_locales/ru/messages.json','LICENSE'].sort();
  const actual=execFileSync('unzip',['-Z1',process.env.XPI_FILE],{encoding:'utf8'}).trim().split('\n').sort();
  assert.deepEqual(actual,expected);
  for(const file of expected)assert.deepEqual(execFileSync('unzip',['-p',process.env.XPI_FILE,file]),fs.readFileSync(path.join(root,file)),file);
});
