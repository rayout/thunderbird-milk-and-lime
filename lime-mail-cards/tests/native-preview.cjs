const assert=require('node:assert/strict');
const connect=require('./marionette.cjs');
async function exercise(){
  const {MailServices}=ChromeUtils.importESModule('resource:///modules/MailServices.sys.mjs');
  const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  if(!Services.io.offline||!Array.from(MailServices.accounts.allServers).every(s=>s.type==='none'))throw Error('Offline local test profile required');
  const pane=document.getElementById('tabmail').currentAbout3Pane;
  pane.paneLayout.messagePaneSplitter.isCollapsed=true;
  pane.threadTree.selectedIndex=-1;
  const folder=MailServices.accounts.localFoldersServer.rootFolder.getChildNamed('Входящие — образец');
  const headers=Array.from(folder.messages);
  const saved=headers.map(h=>[h,h.getStringProperty('preview'),h.flags]);
  const pref='mailnews.database.global.indexer.enabled', enabled=Services.prefs.getBoolPref(pref);
  const addon=await AddonManager.getAddonByID('{cc82279d-63ff-4802-841b-5026940f9ed8}');
  const results=[];
  const check=(name,pass)=>results.push({name,pass:Boolean(pass)});
  const wait=async fn=>{const deadline=Date.now()+5000;while(!fn()){if(Date.now()>deadline)throw Error('Preview condition timed out');await new Promise(r=>setTimeout(r,30));}};
  const rows=()=>Array.from(pane.document.querySelectorAll('.lmc-card'));
  try{
    for(const [h] of saved)h.setStringProperty('preview','');
    Services.prefs.setBoolPref(pref,true);
    await addon.disable();await addon.enable();pane.displayFolder(folder.URI);
    const target=()=>rows().find(row=>pane.gDBView.getMsgHdrAt(row.index).messageId==='lime-demo-v3-4@example.invalid');
    await wait(()=>target()?.querySelector('.lmc-preview')?.textContent.includes('Стенд развёрнут'));
    check('indexed local body shown without cached header preview',!target().querySelector('.lmc-preview').hidden);
    check('reading index never sets header preview',headers.every(h=>h.getStringProperty('preview')===''));
    check('preview lookup preserves message flags',saved.every(([h,,flags])=>h.flags===flags));
    Services.prefs.setBoolPref(pref,false);
    await addon.disable();await addon.enable();
    await wait(()=>rows().length>0&&rows().every(r=>r.querySelector('.lmc-preview')?.hidden));
    check('disabled index leaves two-line subject fallback',rows().every(r=>!r.classList.contains('lmc-has-preview')));
    check('extension does not enable indexing',!Services.prefs.getBoolPref(pref));
  }finally{
    for(const [h,preview] of saved)h.setStringProperty('preview',preview);
    Services.prefs.setBoolPref(pref,enabled);
    await addon.disable();await addon.enable();
  }
  return results;
}
(async()=>{
  const c=await connect(28287,process.env.THUNDERBIRD_TEST_PROFILE);
  try{
    const {value}=await c.executeAsync('const done=arguments[arguments.length-1];('+exercise.toString()+')().then(done,e=>done({error:String(e),stack:e.stack}));');
    console.log(JSON.stringify(value,null,2));assert(!value.error,value.error);assert(value.every(r=>r.pass));
  }finally{await c.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
