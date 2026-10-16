// Run native-demo with 0.1.1 installed, then upgrade this isolated profile without restarting.
const assert = require('node:assert/strict');
const connect = require('./marionette.cjs');
(async () => {
  const c = await connect(28287, process.env.THUNDERBIRD_TEST_PROFILE);
  try {
    const result = (await c.executeAsync(`
      const done=arguments[arguments.length-1];
      (async()=>{
        const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
        const id='{cc82279d-63ff-4802-841b-5026940f9ed8}';
        const previous=await AddonManager.getAddonByID(id);
        if(previous?.version!=='0.1.1')throw Error('Start with the 0.1.1 fixture');
        const pane=document.getElementById('tabmail').currentAbout3Pane,doc=pane.document;
        if(!doc.querySelector('.lmc-card'))throw Error('Run native-demo first');
        const header=pane.gDBView.getMsgHdrAt(0),before=header.flags;
        const file=Services.dirsvc.get('ProfD',Ci.nsIFile);file.append('lime-mail-cards-upgrade.xpi');
        await AddonManager.installTemporaryAddon(file);
        const until=Date.now()+5000;
        while(!doc.querySelector('.lmc-tag')){
          if(Date.now()>until)throw Error('Tag rendering timed out');
          await new Promise(r=>setTimeout(r,50));
        }
        await new Promise(r=>setTimeout(r,300));
        const row=doc.querySelector('.lmc-has-tags'),tags=row.querySelector('.lmc-tags'),pill=tags.querySelector('.lmc-tag');
        return {version:(await AddonManager.getAddonByID(id)).version,
          layout:pane.getComputedStyle(tags).display,
          pillRadius:pane.getComputedStyle(pill).borderRadius,
          legacyHidden:pane.getComputedStyle(row.querySelector('thread-card-tags')).display==='none',
          singleStylesheet:doc.querySelectorAll('link[href*="experiment/cards.css"]').length===1,
          flagsPreserved:header.flags===before};
      })().then(done,error=>done({error:String(error)}));
    `)).value;
    console.log(JSON.stringify(result,null,2));
    assert(!result.error,result.error);
    assert.equal(result.layout,'flex','updated tags must use the new stylesheet immediately');
    assert.equal(result.pillRadius,'20px');
    assert(result.legacyHidden && result.singleStylesheet && result.flagsPreserved);
  } finally { await c.close(); }
})().catch(error=>{console.error(error);process.exit(1);});
