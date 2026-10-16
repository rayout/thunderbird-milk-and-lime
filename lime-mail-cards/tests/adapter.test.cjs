const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const file = path.join(__dirname, '../experiment/api.js');
const scope = {ExtensionCommon:{ExtensionAPI:class {}}, ChromeUtils:{importESModule:()=>({ExtensionSupport:{}})}};
if(fs.existsSync(file)) vm.runInNewContext(fs.readFileSync(file,'utf8'), scope);
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../experiment/threads.js'),'utf8'),scope);
test('adapter reads local preview and displayed correspondent, never message body', () => {
  assert.equal(typeof scope.LimeCards, 'function');
  const api = new scope.LimeCards();
  api.threads=scope.LimeThreads;
  const win = {gDBView:{rowCount:1, getMsgHdrAt:i => {
    assert.equal(i,0);
    return {folder:{URI:'mailbox://test'},messageKey:3,
      getStringProperty:name => {assert.equal(name,'preview'); return 'Local text';},
      get author(){throw new Error('wrong sender for Sent');},
    };
  },cellDataForColumns:()=>['Subject','Recipient','Date']}};
  const row = {index:0, querySelector:s => {assert.equal(s,'.sender');return {textContent:'Recipient'};}};
  const result = api.readRow(win,row);
  assert.equal(result.key,'mailbox://test#3');
  assert.equal(result.displayName,'Recipient');
  assert.equal(result.preview,'Local text');
  for(const index of [-1,1,NaN,null]) assert.equal(api.readRow(win,{...row,index}),null);
  assert.equal(api.readRow({},row),null);
  win.gDBView.getMsgHdrAt=()=>{throw new Error('missing header');};
  assert.equal(api.readRow(win,row),null);
});
test('unavailable local preview leaves initials available', () => {
  assert.equal(typeof scope.LimeCards,'function');
  const api = new scope.LimeCards();
  api.threads=scope.LimeThreads;
  const win = {gDBView:{rowCount:1,getMsgHdrAt:()=>({folder:{URI:'local'},messageKey:1,getStringProperty:()=>{throw Error('missing');}}),cellDataForColumns:()=>['Subject','Alice','Date']}};
  const data=api.readRow(win,{index:0,querySelector:()=>({textContent:'Alice'})});
  assert.equal(data.preview,'');
  assert.equal(data.displayName,'Alice');
});
test('start and stop do not duplicate window listeners and remove their handlers', () => {
  assert.equal(typeof scope.LimeCards,'function');
  const hooks = new Map(), listeners = new Map();
  const main = {document:{getElementById:()=>({tabInfo:[]})},
    addEventListener:(name,fn)=>listeners.set(name,fn),
    removeEventListener:(name,fn)=>{assert.equal(listeners.get(name),fn);listeners.delete(name);}};
  const support = {
    registerWindowListener:(id,hook)=>{assert(!hooks.has(id));hooks.set(id,hook);hook.onLoadWindow(main);return true;},
    unregisterWindowListener:id=>hooks.delete(id),
  };
  scope.ChromeUtils.importESModule=()=>({ExtensionSupport:support});
  scope.Services={scriptloader:{loadSubScriptWithOptions:(url,options)=>{assert(['moz-extension://test/experiment/cards.js','moz-extension://test/experiment/tags.js','moz-extension://test/experiment/threads.js'].includes(url));assert.equal(options.allowUnsafeURL,true);options.target.LimeCards={attach:()=>()=>{}};}},
    obs:{notifyObservers:()=>{},addObserver:()=>{},removeObserver:()=>{}}};
  const api=new scope.LimeCards();
  const sheets = new Set();
  scope.Services.io={newURI:value=>value};
  scope.Ci={nsIStyleSheetService:{}};
  scope.Cc={'@mozilla.org/content/style-sheet-service;1':{getService:()=>({
    USER_SHEET:1,loadAndRegisterSheet:uri=>sheets.add(uri),
    sheetRegistered:uri=>sheets.has(uri),unregisterSheet:uri=>sheets.delete(uri),
  })}};
  api.extension={id:'test-id',manifest:{version:'0.3.0'},rootURI:{resolve:p=>'file:///addon/'+p},getURL:p=>'moz-extension://test/'+p};
  api.start({missingPreview:'None'});
  api.start({missingPreview:'None'});
  assert.equal(hooks.size,1);
  assert.equal(sheets.size,2);
  assert(listeners.size>0);
  api.stop();
  api.stop();
  assert.equal(hooks.size,0);
  assert.equal(sheets.size,0);
  assert.equal(listeners.size,0);
});
test('failed initialization can be stopped and retried', () => {
  const api=new scope.LimeCards();
  api.extension={id:'retry',getURL:p=>'moz-extension://test/'+p};
  scope.Services.scriptloader.loadSubScriptWithOptions=()=>{throw Error('load failed');};
  assert.throws(()=>api.start({missingPreview:'None'}));
  assert.doesNotThrow(()=>api.stop());
  assert(!api.running);
});
test('new mail browsers attach after their own load event and detach cleanly', () => {
  const handlers=new Map(), browserHandlers=new Map();
  const tabs=[];
  const main={document:{getElementById:()=>({tabInfo:tabs})},
    addEventListener:(name,fn)=>handlers.set(name,fn),
    removeEventListener:name=>handlers.delete(name)};
  const browser={contentWindow:{document:{documentURI:'about:blank',readyState:'complete'}},
    addEventListener:(name,fn)=>browserHandlers.set(name,fn),
    removeEventListener:name=>browserHandlers.delete(name)};
  const api=new scope.LimeCards();
  api.running=true;api.windows=new Map();api.documents=new Map();
  const attached=[];api.attachDocument=pane=>attached.push(pane);
  api.attachMainWindow(main);
  tabs.push({chromeBrowser:browser});handlers.get('TabOpen')();
  assert.equal(attached.length,0);
  assert.equal(typeof browserHandlers.get('load'),'function');
  browser.contentWindow={document:{documentURI:'about:3pane',readyState:'complete'}};
  browserHandlers.get('load')();
  assert.equal(attached[0],browser.contentWindow);
  api.detachMainWindow(main);
  assert.equal(handlers.size,0);assert.equal(browserHandlers.size,0);
});
test('local index lookup checks message identity and releases results', () => {
  const api=new scope.LimeCards();
  assert.equal(typeof api.loadPreviews,'function');
  let listener, ids, result, timer;
  const collection={items:[]};
  const win={setTimeout:fn=>{timer=fn;return 1;},clearTimeout:()=>{timer=null;}};
  scope.Services.prefs={getBoolPref:()=>true};
  scope.ChromeUtils.importESModule=name=>{
    assert.equal(name,'resource:///modules/gloda/Gloda.sys.mjs');
    return {Gloda:{newQuery:noun=>{
      assert.equal(noun,102);
      return {id:(...args)=>{ids=args;},getCollection:l=>{listener=l;collection._listener=l;return collection;}};
    }}};
  };
  const data={key:'mailbox://test#3',previewId:33,messageId:'three'};
  api.loadPreviews(win,[data],value=>{result=value;});
  assert.deepEqual(ids,[33]);
  collection.items=[
    {id:33,folder:{uri:'mailbox://wrong'},messageKey:3,headerMessageID:'three',indexedBodyText:'Wrong folder'},
    {id:33,folder:{uri:'mailbox://test'},messageKey:3,headerMessageID:'other',indexedBodyText:'Wrong message'},
    {id:33,folder:{uri:'mailbox://test'},messageKey:3,headerMessageID:'three',indexedBodyText:'Local body'},
  ];
  assert.doesNotThrow(()=>listener.onItemsAdded(collection.items,collection));
  assert.doesNotThrow(()=>listener.onItemsModified([],collection));
  assert.doesNotThrow(()=>listener.onItemsRemoved([],collection));
  listener.onQueryCompleted(collection);
  assert.equal(result.get('mailbox://test#3#three#33'),'Local body');
  assert.equal(collection._listener,null);
  assert.equal(timer,null);
  let called=false;
  const cancel=api.loadPreviews(win,[data],()=>{called=true;});
  cancel();listener.onQueryCompleted(collection);
  assert.equal(called,false);
  assert.equal(timer,null);
});
test('disabled index is never opened and a failed lookup falls back', () => {
  const api=new scope.LimeCards();
  assert.equal(typeof api.loadPreviews,'function');
  let imported=0, result, timeout;
  const win={setTimeout:fn=>{timeout=fn;return 1;},clearTimeout:()=>{}};
  scope.Services.prefs={getBoolPref:()=>false};
  scope.ChromeUtils.importESModule=()=>{imported++;throw Error('unavailable');};
  api.loadPreviews(win,[{previewId:33}],value=>{result=value;});
  assert.equal(imported,0);assert.equal(result.size,0);
  scope.Services.prefs.getBoolPref=()=>true;
  api.loadPreviews(win,[{previewId:33}],value=>{result=value;});
  assert.equal(imported,1);assert.equal(result.size,0);
  scope.ChromeUtils.importESModule=()=>({Gloda:{newQuery:()=>({id:()=>{},getCollection:()=>({_listener:{}})})}});
  result=null;api.loadPreviews(win,[{previewId:33}],value=>{result=value;});
  timeout();assert.equal(result.size,0);
});
