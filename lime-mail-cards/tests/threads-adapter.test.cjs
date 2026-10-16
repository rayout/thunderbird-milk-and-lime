const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
  const services={accounts:{allIdentities:[{email:'me@example.invalid'}]},headerParser:{parseDecodedHeader:value=>[{email:value}]}};
  const scope={ExtensionCommon:{ExtensionAPI:class{}},Ci:{nsMsgMessageFlags:{HasRe:16},nsIMsgFolderNotificationService:{msgPropertyChanged:64}},Services:{intl:{DateTimeFormat:class extends Intl.DateTimeFormat{constructor(_,options){super('en-GB',{...options,timeZone:'UTC'});}}}},ChromeUtils:{importESModule:name=>name.includes('DisplayNameUtils')?{DisplayNameUtils:{formatDisplayNameList:value=>value}}:{MailServices:services}}};
  for(const name of ['threads.js','api.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../experiment',name),'utf8'),scope);
  const api=new scope.LimeCards();api.threads=scope.LimeThreads;
  const folder={URI:'mailbox://test'};
  const root={folder,messageKey:1,messageId:'root',dateInSeconds:1,getStringProperty:()=> 'Old preview',getUint32Property:()=>33};
  const latest={folder,messageKey:2,messageId:'latest',dateInSeconds:1704110400,flags:16,mime2DecodedSubject:'Latest subject',mime2DecodedAuthor:'Bob',mime2DecodedRecipients:'Recipient',getStringProperty:()=> 'Latest preview',getUint32Property:()=>34};
  const win={gViewWrapper:{isCollapsedThreadAtIndex:()=>true},threadPane:{cardColumns:['subjectCol','senderCol','dateCol']},gDBView:{rowCount:1,getMsgHdrAt:()=>root,getThreadContainingIndex:()=>({numChildren:2,getChildHdrAt:i=>[root,latest][i]}),cellDataForColumns:()=>['Root subject','Alice','Earlier']}};
  return {api,win,root,latest,scope,services,row:{index:0,querySelector:()=>({textContent:'Stale overlay'})}};
}
test('collapsed adapter binds preview identity and displayed fields to newest header',()=>{
  const f=fixture(),data=f.api.readRow(f.win,f.row);
  assert.equal(data.key,'mailbox://test#2');assert.equal(data.messageId,'latest');assert.equal(data.previewId,34);assert.equal(data.preview,'Latest preview');
  assert.equal(data.displayName,'Bob');assert.equal(data.summary.subject,'Re: Latest subject');assert.equal(data.summary.sender,'Bob');assert.equal(data.summary.date,'01/01/2024, 12:00');
  assert.equal(data.nativeSummary.sender,'Alice');assert.deepEqual(Array.from(data.headers),[f.root,f.latest]);
});
test('expanded adapter uses native row formatting after a summary was displayed',()=>{
  const f=fixture();f.win.gViewWrapper.isCollapsedThreadAtIndex=()=>false;
  const data=f.api.readRow(f.win,f.row);
  assert.equal(data.key,'mailbox://test#1');assert.equal(data.displayName,'Alice');assert.equal(data.preview,'Old preview');assert.equal(data.summary,null);assert.deepEqual(Array.from(data.headers),[f.root]);
});
test('outgoing and correspondent summary retain recipient semantics',()=>{
  const f=fixture();f.win.threadPane.cardColumns[1]='recipientCol';
  assert.equal(f.api.readRow(f.win,f.row).displayName,'Recipient');
  f.win.threadPane.cardColumns[1]='correspondentCol';f.latest.mime2DecodedAuthor='me@example.invalid';
  assert.equal(f.api.readRow(f.win,f.row).displayName,'Recipient');
  f.latest.mime2DecodedAuthor='other@example.invalid';
  assert.equal(f.api.readRow(f.win,f.row).displayName,'other@example.invalid');
});
test('external keyword changes refresh cards and cleanup unregisters listener',()=>{
  const f=fixture(),{api,win,scope,services}=f;let listener,removed=0,events=0,disposed=0;
  services.mfn={addListener:(value,flags)=>{assert.equal(flags,64);listener=value;},removeListener:value=>{assert.equal(value,listener);removed++;}};
  scope.Services.prefs={addObserver(){},removeObserver(){}};
  const doc={getElementById:()=>({}),createElementNS:()=>({remove(){}}),head:{append(){}}};win.document=doc;win.Event=class{};win.dispatchEvent=()=>events++;win.addEventListener=()=>{};win.removeEventListener=()=>{};
  api.running=true;api.documents=new Map();api.options={tagLabel:'Tags',removeTagLabel:'Remove'};api.extension={getURL:p=>p,manifest:{version:'1'}};
  api.cards={attach:()=>()=>disposed++};api.tags={create:(w,options)=>{assert.equal(options.removeLabel,'Remove');assert.deepEqual(Array.from(options.headersForRow(f.row)),[f.root,f.latest]);return{dispose(){}};}};
  api.attachDocument(win,{});
  assert.equal(typeof listener?.msgPropertyChanged,'function');
  listener.msgPropertyChanged(f.latest,'junkscore','0','100');assert.equal(events,0);
  listener.msgPropertyChanged(f.latest,'keywords','red','');assert.equal(events,1);
  api.documents.get(doc).cleanup();assert.equal(removed,1);assert.equal(disposed,1);assert.equal(api.documents.size,0);
});
