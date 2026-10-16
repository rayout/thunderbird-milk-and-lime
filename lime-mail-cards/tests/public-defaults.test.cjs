const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('fresh installation makes no logo request; explicit opt-in remains effective', async () => {
  for (const saved of [{}, {onlineAvatars: true}, {onlineAvatars: false}]) {
    let onRequest;
    const requests = [], images = [];
    const scope = {
      URL, AbortController, setTimeout, clearTimeout, Blob, console,
      fetch: async url => { requests.push(url); return new Response('', {status:404}); },
      messenger: {
        i18n: {getMessage: key => key},
        storage: {local: {get: async defaults => ({...defaults, ...saved}), set: async () => {}}, onChanged: {addListener() {}}},
        LimeCards: {setNicknameSenders:async()=>{},getContactPhoto: async () => '', onAvatarRequest: {addListener(fn) {onRequest = fn;}}, start: async () => {}, setAvatar: async (...args) => images.push(args)},
      },
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../avatars.js'), 'utf8'), scope);
    await vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../background.js'), 'utf8'), scope);
    onRequest('person@company.com', 1);
    for (let i = 0; i < 20 && !images.length; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(images.length, 1);
    assert.equal(requests.length, saved.onlineAvatars === true ? 1 : 0);
  }
});
