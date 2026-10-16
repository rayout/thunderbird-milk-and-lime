const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../background.js'), 'utf8');
for (const saved of [undefined, false, true, 'invalid']) {
  test('saved layout is applied and changes update live: ' + saved, async () => {
    let listener, started;
    const updates = [];
    const messenger = {
      i18n: {getMessage: key => key},
      storage: {local: {get: async () => ({separateTags:saved})}, onChanged: {addListener: fn => {listener=fn;}}},
      LimeCards: {setNicknameSenders:async()=>{},onAvatarRequest:{addListener(){}}, start: async value => {started=value;}, setSeparateTags: async value => {updates.push(value);}},
    };
    await vm.runInNewContext(source, {messenger, console, LimeAvatars:{create:()=>({configure(){}})}});
    assert.equal(started.separateTags, saved === true);
    assert.equal(typeof listener, 'function');
    listener({separateTags:{newValue:true}}, 'local');
    listener({separateTags:{newValue:false}}, 'local');
    listener({unrelated:{newValue:true}}, 'local');
    listener({separateTags:{newValue:true}}, 'sync');
    assert.deepEqual(updates, [true,false]);
  });
}
test('obsolete stretched logo cache is discarded while current cache is retained', async () => {
  for (const version of [undefined, 0, 1]) {
    let options, written;
    const cache = {'company.com': {image:'old-image', expires:9999}};
    const messenger = {
      i18n:{getMessage:key=>key},
      storage:{local:{get:async()=>({avatarCache:cache,avatarCacheVersion:version}),set:async value=>{written=value;}},onChanged:{addListener(){}}},
      LimeCards:{setNicknameSenders:async()=>{},onAvatarRequest:{addListener(){}},start:async()=>{}},
    };
    await vm.runInNewContext(source,{messenger,console,LimeAvatars:{create:value=>{options=value;return {configure(){}};}}});
    assert.equal(Object.keys(options.cache).length,version===1?1:0);
    if(version===1) assert.equal(options.cache,cache);
    await options.save({});
    assert.equal(written.avatarCacheVersion,1);
  }
});
