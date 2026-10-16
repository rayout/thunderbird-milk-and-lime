const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const root = path.join(__dirname, '..');
test('release builds reproducibly and keeps private files and advanced CSS out of the theme', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'lime-release-test-'));
  const build = () => execFileSync('python3', [path.join(root,'scripts/build.py'), '--output', output]);
  build();
  const files = fs.readdirSync(output).sort();
  assert.deepEqual(files, ['SHA256SUMS', 'lime-mail-cards-0.3.0.xpi', 'milk-lime-source-0.3.0.zip', 'milk-lime-theme-0.1.0.xpi']);
  const first = files.map(name => fs.readFileSync(path.join(output, name)));
  build();
  files.forEach((name,i) => assert.deepEqual(fs.readFileSync(path.join(output,name)), first[i]));
  const entries = name => execFileSync('unzip', ['-Z1',path.join(output,name)], {encoding:'utf8'}).trim().split('\n').sort();
  assert.deepEqual(entries('milk-lime-theme-0.1.0.xpi'), ['LICENSE','_locales/en/messages.json','_locales/ru/messages.json','manifest.json']);
  assert(entries('lime-mail-cards-0.3.0.xpi').includes('styles/interface.css'));
  assert(entries('lime-mail-cards-0.3.0.xpi').includes('styles/content.css'));
  assert(!entries('milk-lime-source-0.3.0.zip').some(name => name.startsWith('advanced-styles/')));
  assert(!entries('lime-mail-cards-0.3.0.xpi').some(name => /tests|userChrome|userContent/.test(name)));
  assert(!entries('milk-lime-source-0.3.0.zip').some(name => /backup|\.xpi$|\.sqlite$|prefs\.js$/.test(name)));
  execFileSync(process.execPath, [path.join(root,'lime-mail-cards/tests/package.test.cjs')], {
    env: {...process.env, XPI_FILE:path.join(output,'lime-mail-cards-0.3.0.xpi')},
  });
});
