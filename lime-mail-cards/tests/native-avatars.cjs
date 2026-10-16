const assert=require('node:assert/strict');
const connect=require('./marionette.cjs');
async function exercise() {
  const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const {MailServices}=ChromeUtils.importESModule('resource:///modules/MailServices.sys.mjs');
  const id='{cc82279d-63ff-4802-841b-5026940f9ed8}';
  const addon=await AddonManager.getAddonByID(id);
  const tabmail=document.getElementById('tabmail');tabmail.switchToTab(0);
  const pane=tabmail.currentAbout3Pane;pane.threadTree.scrollToIndex(0);
  const results=[];const check=(name,pass)=>{results.push({name,pass:!!pass});if(!pass)throw Error(name);};
  const wait=async fn=>{const end=Date.now()+6000;while(!await fn()){if(Date.now()>end)throw Error('Timed out: '+fn);await new Promise(r=>setTimeout(r,30));}};
  const canvas=document.createElementNS('http://www.w3.org/1999/xhtml','canvas');canvas.width=canvas.height=64;
  const image=color=>{const c=canvas.getContext('2d');c.fillStyle=color;c.fillRect(0,0,64,64);return canvas.toDataURL('image/png');};
  const red=image('red'), green=image('green'), blue=image('blue');
  const picture=()=>pane.document.querySelector('.lmc-avatar img');
  let tab;
  const open=async()=>{tab=tabmail.openTab('contentTab',{url:addon.optionsURL,background:true});await wait(()=>run("return document.getElementById('onlineAvatars')?.disabled===false;"));};
  const run=script=>tab.browser.browsingContext.currentWindowGlobal.getActor('MarionetteCommands').executeScript(script,[],{newSandbox:false,timeout:5000});
  let card;const book=MailServices.ab.getDirectory('jsaddrbook://abook.sqlite');
  try {
    await open();
    await run("return messenger.storage.local.set({onlineAvatars:false,avatarRules:{'example.invalid':"+JSON.stringify(red)+"}});");
    await wait(()=>picture()?.src===red&&picture().complete&&picture().naturalWidth===64);
    check('domain assignment renders one decoded image per card',pane.document.querySelectorAll('.lmc-avatar').length===pane.document.querySelectorAll('.lmc-card').length);
    await run("return messenger.storage.local.set({avatarRules:{'example.invalid':"+JSON.stringify(red)+",'alice@example.invalid':"+JSON.stringify(green)+"}});");
    await wait(()=>picture()?.src===green);
    check('exact address overrides assigned domain',true);
    const photos=PathUtils.join(PathUtils.profileDir,'Photos');await IOUtils.makeDirectory(photos,{ignoreExisting:true});
    await IOUtils.write(PathUtils.join(photos,'avatar-test.png'),Uint8Array.from(atob(blue.split(',')[1]),c=>c.charCodeAt(0)));
    card=Cc['@mozilla.org/addressbook/cardproperty;1'].createInstance(Ci.nsIAbCard);
    card.primaryEmail='alice@example.invalid';card.displayName='Alice Brown';card.setProperty('PhotoName','avatar-test.png');card=book.addCard(card);
    await wait(()=>picture()?.src===blue);
    check('local address book photo overrides assignments and updates live',true);
    book.deleteCards([card]);card=null;
    await wait(()=>picture()?.src===green);
    check('deleting a contact photo restores assigned image',true);
    await run("return messenger.storage.local.set({avatarRules:{}});");
    await wait(()=>!picture());check('removing assignments restores initials',pane.document.querySelector('.lmc-avatar').textContent==='AB');
    const uploadScript=`
      const canvas=document.createElement('canvas');canvas.width=128;canvas.height=80;
      const c=canvas.getContext('2d');c.fillStyle='purple';c.fillRect(0,0,128,80);
      const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
      const transfer=new DataTransfer();transfer.items.add(new File([blob],'avatar.png',{type:'image/png'}));
      document.getElementById('avatarFile').files=transfer.files;
      document.getElementById('avatarKey').value='ALICE@example.invalid';
      document.getElementById('avatarForm').requestSubmit();
    `;
    await run('return (async()=>{'+uploadScript+'})();');
    await wait(()=>picture()?.complete&&picture()?.naturalWidth===64);
    check('settings upload crops a real file and displays it live',picture().naturalHeight===64);
    tabmail.closeTab(tab);await open();
    check('assignment survives settings reopen',await run("return document.querySelectorAll('#avatarRules tr').length===1;"));
    await run("document.querySelector('#avatarRules button').click();");await wait(()=>!picture());
    check('settings remove button restores initials',true);
    check('automatic lookup switch persisted off',await run("return !document.getElementById('onlineAvatars').checked;"));
    await run("document.getElementById('clearAvatarCache').click();");
    await wait(()=>run("return document.getElementById('status').textContent.includes('Cache reset');"));
    check('cache refresh control works',true);
    const errors=Services.console.getMessageArray().filter(m=>/Lime Mail Cards:|avatars.js.*Error/.test(m.message)).map(m=>m.message);
    check('no avatar runtime errors',errors.length===0);
    return {results};
  } finally {if(card)book.deleteCards([card]);if(tab&&tabmail.tabInfo.includes(tab))tabmail.closeTab(tab);}
}
(async()=>{
  const c=await connect(28287,process.env.THUNDERBIRD_TEST_PROFILE);
  try{const {value}=await c.executeAsync('const done=arguments[arguments.length-1];('+exercise.toString()+')().then(done,e=>done({error:String(e),stack:e.stack}));');console.log(JSON.stringify(value,null,2));assert(!value.error,value.error);assert(value.results.every(r=>r.pass));}finally{await c.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
