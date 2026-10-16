const assert=require('node:assert/strict');
const connect=require('./marionette.cjs');
(async()=>{
 const c=await connect(28287,process.env.THUNDERBIRD_TEST_PROFILE);
 try {
 const {value}=await c.executeAsync(`const done=arguments[arguments.length-1];(async()=>{
  const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const addon=await AddonManager.getAddonByID('{cc82279d-63ff-4802-841b-5026940f9ed8}');
  const tabs=document.getElementById('tabmail');const tab=tabs.openTab('contentTab',{url:addon.optionsURL,background:true});
  const run=script=>tab.browser.browsingContext.currentWindowGlobal.getActor('MarionetteCommands').executeScript(script,[],{newSandbox:false,timeout:10000});
  const offline=Services.io.offline;
  try{
   const deadline=Date.now()+4000;while(!await run('return typeof LimeAvatars!=="undefined";')){if(Date.now()>deadline)throw Error('Options timeout');await new Promise(r=>setTimeout(r,30));}
   Services.io.offline=false;
   return await run(\`return (async()=>{
    let count=0, saved;
    const resolver=LimeAvatars.create({contact:async()=>'',save:async value=>{saved=value;},fetch:(url,options)=>{count++;return fetch(url,options);}});
    resolver.configure({onlineAvatars:true});
    const image=await resolver.resolve('avatar-test@mozilla.org');
    await resolver.resolve('another-test@mozilla.org');await resolver.flush();
    return {image:LimeAvatars.imageData(image),length:image.length,requests:count,cached:Object.keys(saved)};
   })();\`);
  }finally{Services.io.offline=offline;tabs.closeTab(tab);}
 })().then(done,e=>done({error:String(e),stack:e.stack}));`);
 console.log(JSON.stringify(value,null,2));assert(!value.error,value.error);assert(value.image,'Public logo fetched and decoded');assert.equal(value.requests,1);
 }finally{await c.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
