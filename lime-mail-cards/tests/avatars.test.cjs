const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const scope = {URL, AbortController, setTimeout, clearTimeout, console, fetch, Blob};
const file = require('node:path').join(__dirname, '../avatars.js');
if (fs.existsSync(file)) vm.runInNewContext(fs.readFileSync(file, 'utf8'), scope);
const png = 'data:image/png;base64,aGVsbG8=';
test('nickname identities reach local contacts but fallback logos use only the sender domain', async () => {
 const seen=[];
 const {resolver,calls}=setup({contact:async (address,nickname)=>{seen.push([address,nickname]);return nickname==='anna'?png:'';}});
 resolver.configure({onlineAvatars:true});
 assert.equal(await resolver.resolve('["notify@example.com","anna"]'),png);
 assert.deepEqual(seen[0],['notify@example.com','anna']);
 assert.equal(calls.length,0);
 await resolver.resolve('["notify@example.com","other"]');
 assert.equal(calls[0].url,'https://icons.duckduckgo.com/ip3/example.com.ico');
 await resolver.flush();
 for(const bad of ['[bad','["notify@example.com",{}]','["notify@example.com","a b"]']) assert.equal(await resolver.resolve(bad),'');
});
function setup(overrides = {}) {
  const calls = [], saved = [];
  const resolver = scope.LimeAvatars.create({
    contact: async () => '', normalize: async () => png,
    fetch: async (url, options) => { calls.push({url, options}); return new Response('image', {headers:{'content-type':'image/png'}}); },
    save: async value => saved.push(value), ...overrides,
  });
  return {resolver, calls, saved};
}
test('local contact, exact address, domain and online fallback have the agreed priority', async () => {
  assert(scope.LimeAvatars, 'avatar resolver exists');
  const {resolver, calls} = setup({contact:async address=>address.startsWith('photo@') ? png : ''});
  resolver.configure({avatarRules:{'alice@example.com':png, 'example.com':png}, onlineAvatars:true});
  for (const address of ['photo@other.com','ALICE@example.com','bob@example.com']) assert.equal(await resolver.resolve(address), png);
  assert.equal(calls.length, 0);
  assert.equal(await resolver.resolve('bob@other.com'),png);
  assert.equal(calls[0].url,'https://icons.duckduckgo.com/ip3/other.com.ico');
  assert.equal(calls[0].options.credentials,'omit');
  assert.equal(calls[0].options.redirect,'error');
});
test('offline mode and unsafe or public mailbox domains make no network request', async () => {
  const {resolver,calls}=setup();
  resolver.configure({onlineAvatars:false});
  assert.equal(await resolver.resolve('a@company.com'),'');
  resolver.configure({onlineAvatars:true});
  for(const address of ['bad','a@localhost','a@127.0.0.1','a@x.local','a@gmail.com','a@x.com/path','a@x.com?secret','a@x.com:80']) assert.equal(await resolver.resolve(address),'');
  assert.equal(calls.length,0);
  assert.equal(scope.LimeAvatars.ruleKey(' Alice@Example.com '),'alice@example.com');
  assert.equal(scope.LimeAvatars.ruleKey('https://example.com'),'');
});
test('domain requests deduplicate, success persists, failure is cached, and concurrency is bounded', async () => {
  let active=0,peak=0;
  const {resolver,calls,saved}=setup({fetch:async url=>{
    calls.push(url);active++;peak=Math.max(peak,active);
    await new Promise(r=>setTimeout(r,5));active--;
    return new Response('image', {status:url.includes('missing')?404:200,headers:{'content-type':'image/png'}});
  }});
  resolver.configure({onlineAvatars:true});
  await Promise.all(['a@one.com','b@one.com','a@two.com','a@three.com','a@missing.com'].map(a=>resolver.resolve(a)));
  await resolver.resolve('b@missing.com');
  assert.equal(calls.length,4);assert(peak<=2);
  await resolver.flush();assert(saved.length>0);
  const next=setup({cache:saved.at(-1)});
  next.resolver.configure({onlineAvatars:true});
  assert.equal(await next.resolver.resolve('a@one.com'),png);
  assert.equal(await next.resolver.resolve('a@missing.com'),'');
  assert.equal(next.calls.length,0);
});
test('failed contact lookup falls through, remote image validation fails closed, settings abort old lookups', async () => {
  const {resolver,calls}=setup({contact:async()=>{throw Error('address book unavailable');},normalize:async()=>{throw Error('not an image');}});
  resolver.configure({onlineAvatars:true});
  assert.equal(await resolver.resolve('a@company.com'),'');
  assert.equal(await resolver.resolve('b@company.com'),'');assert.equal(calls.length,1);
  let started;
  const pending=setup({fetch:(url,{signal})=>new Promise((resolve,reject)=>{started=()=>signal.aborted;signal.addEventListener('abort',()=>reject(Error('aborted')));})});
  pending.resolver.configure({onlineAvatars:true});
  const result=pending.resolver.resolve('a@company.com');
  await new Promise(r=>setTimeout(r,0));
  pending.resolver.configure({onlineAvatars:false});
  assert(started());assert.equal(await result,'');
});
test('expired cache is refreshed and oversized network responses never reach the decoder', async () => {
  let decoded=0;
  const {resolver,calls}=setup({
    cache:{'company.com':{image:png,expires:1}}, now:()=>2,
    fetch:async url=>{calls.push(url);return new Response(new Uint8Array(262145),{headers:{'content-type':'image/png'}});},
    normalize:async()=>{decoded++;return png;},
  });
  resolver.configure({onlineAvatars:true});
  assert.equal(await resolver.resolve('a@company.com'),'');
  assert.equal(calls.length,1);assert.equal(decoded,0);
});
test('local contacts and assignments work for private domains without external requests', async () => {
  const {resolver,calls}=setup({contact:async address=>address==='a@office.local'?png:''});
  resolver.configure({onlineAvatars:true,avatarRules:{'office.internal':png}});
  assert.equal(await resolver.resolve('a@office.local'),png);
  assert.equal(await resolver.resolve('b@office.internal'),png);
  assert.equal(calls.length,0);
});
test('unassigned domains have no bundled brand image; user assignments still work offline', async () => {
  const {resolver,calls}=setup();
  resolver.configure({onlineAvatars:false});
  assert.equal(await resolver.resolve('person@company.com'),'');
  resolver.configure({onlineAvatars:false,avatarRules:{'company.com':png}});
  assert.equal(await resolver.resolve('person@company.com'),png);
  assert.equal(calls.length,0);
});
