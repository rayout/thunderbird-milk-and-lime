const assert=require('node:assert/strict');
const connect=require('./marionette.cjs');
async function exercise(){
  const {MailServices}=ChromeUtils.importESModule('resource:///modules/MailServices.sys.mjs');
  const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  if(!Services.io.offline||!Array.from(MailServices.accounts.allServers).every(s=>s.type==='none'))throw Error('Offline local profile required');
  const p=document.getElementById('tabmail').currentAbout3Pane,d=p.document;
  p.paneLayout.messagePaneSplitter.isCollapsed=true;
  p.threadTree.selectedIndex=1;
  const headers=Array.from(p.gFolder.messages),flags=headers.map(h=>h.flags);
  const original=headers.map(h=>h.getStringProperty('keywords'));
  const tag=MailServices.tags.getAllTags()[0];
  const row=()=>p.threadTree.getRowAtIndex(0);
  const target=p.gDBView.getMsgHdrAt(0),other=p.gDBView.getMsgHdrAt(1);
  const assigned=()=>target.getStringProperty('keywords').split(' ').includes(tag.key);
  const wasAssigned=assigned(),selected=p.threadTree.selectedIndex;
  const addon=await AddonManager.getAddonByID('{cc82279d-63ff-4802-841b-5026940f9ed8}');
  const wait=async fn=>{const deadline=Date.now()+4000;while(!fn()){if(Date.now()>deadline)throw Error('Tag condition timed out: '+fn);await new Promise(r=>setTimeout(r,30));}};
  const results=[],check=(name,pass,detail)=>results.push({name,pass:Boolean(pass),detail});
  try{
    await wait(()=>row()?.querySelector('.lmc-tag-button'));
    const height=row().getBoundingClientRect().height;
    const button=row().querySelector('.lmc-tag-button');button.click();
    await wait(()=>d.querySelector('.lmc-tag-popup')?.state==='open');
    check('quick tag popup opens',button.getAttribute('aria-expanded')==='true');
    check('opening popup does not select its message',p.threadTree.selectedIndex===selected);
    const item=[...d.querySelector('.lmc-tag-popup').children].find(i=>i.getAttribute('label')===tag.tag);
    item.doCommand();
    await wait(()=>assigned()!==wasAssigned);
    check('only targeted message tags changed',other.getStringProperty('keywords')===original[headers.indexOf(other)]);
    await wait(()=>row().querySelector('.lmc-tags')?.textContent.includes(tag.tag)===!wasAssigned);
    check('native tag update renders named pill',row().querySelector('.lmc-tags').textContent.includes(tag.tag)===!wasAssigned);
    check('tag action preserves row height',row().getBoundingClientRect().height===height);
    check('tag action preserves selection and read flags',p.threadTree.selectedIndex===selected&&headers.every((h,i)=>h.flags===flags[i]));
    row().querySelector('.lmc-tag-button').click();await wait(()=>d.querySelector('.lmc-tag-popup')?.state==='open');
    [...d.querySelector('.lmc-tag-popup').children].find(i=>i.getAttribute('label')===tag.tag).doCommand();
    await wait(()=>assigned()===wasAssigned);
    check('tag can be removed again',assigned()===wasAssigned);
    row().querySelector('.lmc-tag-button').click();await wait(()=>d.querySelector('.lmc-tag-popup')?.state==='open');
    await addon.disable();
    check('disable closes popup and removes tag controls',!d.querySelector('.lmc-tag-popup,.lmc-tag-button,.lmc-tags'));
  }finally{
    if(assigned()!==wasAssigned){if(wasAssigned)target.folder.addKeywordsToMessages([target],tag.key);else target.folder.removeKeywordsFromMessages([target],tag.key);}
    await addon.enable();
  }
  return results;
}
(async()=>{const c=await connect(28287,process.env.THUNDERBIRD_TEST_PROFILE);try{
  const {value}=await c.executeAsync('const done=arguments[arguments.length-1];('+exercise.toString()+')().then(done,e=>done({error:String(e),stack:e.stack}));');
  console.log(JSON.stringify(value,null,2));assert(!value.error,value.error);assert(value.every(r=>r.pass));
}finally{await c.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
