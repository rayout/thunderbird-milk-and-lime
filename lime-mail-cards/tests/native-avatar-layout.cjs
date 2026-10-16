const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const connect=require('./marionette.cjs');
(async()=>{
 const c=await connect(28289,process.env.THUNDERBIRD_TEST_PROFILE);
 try{
  const result=await c.executeAsync(`const done=arguments[arguments.length-1];(async()=>{
   const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
   const file=Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);file.initWithPath(${JSON.stringify(path.resolve(process.env.XPI_FILE || 'outputs/lime-mail-cards-0.2.3.xpi'))});
   await AddonManager.installTemporaryAddon(file);
   const tabs=document.getElementById('tabmail');tabs.switchToTab(0);const pane=tabs.currentAbout3Pane;
   const end=Date.now()+5000;while(!pane.document.querySelector('.lmc-avatar')){if(Date.now()>end)throw Error('No cards');await new Promise(r=>setTimeout(r,50));}
   pane.threadTree.scrollToIndex(0);await new Promise(r=>setTimeout(r,600));
   return [...pane.document.querySelectorAll('.lmc-card')].filter(r=>r.getBoundingClientRect().y>=0).slice(0,4).map(row=>{
    const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,cy:r.y+r.height/2};};
    return {row:rect(row),cell:rect(row.querySelector('td')),container:rect(row.querySelector('.card-container')),avatar:rect(row.querySelector('.lmc-avatar')),text:rect(row.querySelector('.thread-card-column:not(.read-status-column)'))};
   });
  })().then(done,e=>done({error:String(e)}));`);
  console.log(JSON.stringify(result.value,null,2));assert(!result.value.error);
 }finally{await c.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
