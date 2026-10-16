const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
test('public runtime contains no private deployment identifiers or bundled company logo', () => {
  for (const file of ['avatars.js', 'experiment/api.js']) {
    const text = fs.readFileSync(path.join(root, 'lime-mail-cards', file), 'utf8');
    assert.doesNotMatch(text, /kodeks|\/home\/|LimeGitLabUsername/i, file);
  }
});
