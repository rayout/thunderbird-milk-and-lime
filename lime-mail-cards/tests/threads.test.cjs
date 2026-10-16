const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scope = {};
const source = path.join(__dirname, '../experiment/threads.js');
if (fs.existsSync(source)) vm.runInNewContext(fs.readFileSync(source, 'utf8'), scope);
const describe = (win, row) => {
  assert.equal(typeof scope.LimeThreads?.describeRow, 'function');
  return scope.LimeThreads.describeRow(win, row);
};
function fixture() {
  const a = {folder:{URI:'mailbox://a'}, messageKey:1, messageId:'a', dateInSeconds:100};
  const b = {folder:{URI:'mailbox://b'}, messageKey:1, messageId:'b', dateInSeconds:300};
  const c = {folder:a.folder, messageKey:2, messageId:'c', dateInSeconds:200};
  const headers = [a,b,c];
  const row = {index:0};
  let reads = 0;
  const win = {
    gDBView:{rowCount:1, getMsgHdrAt:()=>a, getThreadContainingIndex: index => {
      assert.equal(index, 0);
      return {numChildren:3, getChildHdrAt:i=>{reads++;return headers[i];}};
    }},
    gViewWrapper:{isCollapsedThreadAtIndex:()=>true},
  };
  return {win,row,a,b,c,headers,reads:()=>reads};
}
test('collapsed summary uses the newest member, not native order or duplicate cross-folder keys', () => {
  const f = fixture();
  const data = describe(f.win,f.row);
  assert.equal(data.root,f.a);
  assert.equal(data.header,f.b);
  assert.deepEqual(Array.from(data.headers),f.headers);
  assert.equal(data.collapsed,true);
  assert.equal(f.reads(),3);
  assert.deepEqual(f.headers,[f.a,f.b,f.c]);
});
test('expanded rows and unthreaded messages never enumerate the thread', () => {
  const f = fixture();
  f.win.gViewWrapper.isCollapsedThreadAtIndex=()=>false;
  const data=describe(f.win,f.row);
  assert.equal(data.header,f.a);
  assert.equal(data.collapsed,false);
  assert.deepEqual(Array.from(data.headers),[f.a]);
  assert.equal(f.reads(),0);
});
test('invalid rows and incomplete threads cannot supply partial tag-write targets', () => {
  const f=fixture();
  for(const index of [-1,1,NaN,null]) assert.equal(describe(f.win,{index}),null);
  assert.equal(describe({},f.row),null);
  f.win.gDBView.getThreadContainingIndex=()=>({numChildren:3,getChildHdrAt:i=>{if(i===1)throw Error('gone');return f.a;}});
  assert.equal(describe(f.win,f.row),null);
});
test('re-reading after expand or row reuse returns only current identities', () => {
  const f=fixture();
  assert.equal(describe(f.win,f.row).header,f.b);
  f.win.gViewWrapper.isCollapsedThreadAtIndex=()=>false;
  f.win.gDBView.getMsgHdrAt=()=>f.c;
  const data=describe(f.win,f.row);
  assert.equal(data.header,f.c);
  assert.deepEqual(Array.from(data.headers),[f.c]);
});
