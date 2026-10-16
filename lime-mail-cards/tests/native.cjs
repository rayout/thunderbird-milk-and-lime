const assert=require('node:assert/strict'),fs=require('node:fs');
const connect=require('./marionette.cjs');
async function exercise(addonName){
  const results=[];
  const check=(name,pass,detail)=>results.push({name,pass:Boolean(pass),detail});
  const wait=async predicate=>{
    const end=Date.now()+4000;
    while(!predicate()){if(Date.now()>end)throw Error('Native condition timed out: '+predicate.toString());await new Promise(r=>setTimeout(r,30));}
  };
  const settle=()=>new Promise(r=>setTimeout(r,100));
  const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const {MailServices}=ChromeUtils.importESModule('resource:///modules/MailServices.sys.mjs');
  const indexPref='mailnews.database.global.indexer.enabled';
  const indexEnabled=Services.prefs.getBoolPref(indexPref);
  // This matrix covers the header-cache fallback; native-preview.cjs covers indexed bodies.
  Services.prefs.setBoolPref(indexPref,false);
  try {
  const id='{cc82279d-63ff-4802-841b-5026940f9ed8}';
  let addon=await AddonManager.getAddonByID(id);
  if(addon)await addon.uninstall();
  const conversations=await AddonManager.getAddonByID('gconversation@xulforum.org');
  if(conversations?.isActive)await conversations.disable();
  Services.console.reset();
  Services.io.offline=true;
  const tabmail=document.getElementById('tabmail');
  for (const tab of [...tabmail.tabInfo].slice(1)) tabmail.closeTab(tab);
  const pane=tabmail.currentAbout3Pane;
  const folder=MailServices.accounts.localFoldersServer.rootFolder.getChildNamed('Lime Test');
  pane.paneLayout.messagePaneSplitter.isCollapsed=true;
  pane.threadTree.selectedIndex=-1;
  pane.displayFolder(folder.URI);
  pane.threadTree.setAttribute('rows','thread-card');
  await wait(()=>pane.gDBView?.rowCount===40);
  // Visiting folders clears Thunderbird's transient New flag independently of the add-on.
  folder.clearNewMessages();
  const headers=Array.from(folder.messages);
  const flags=()=>headers.map(h=>[h.messageKey,h.flags]);
  const initialFlags=JSON.stringify(flags());
  const originallyCached=headers.filter(h=>h.getStringProperty('preview')).length;
  for(const h of headers) h.setStringProperty('preview', h.messageKey%2 ? 'Cached text '+h.messageKey : '');
  const file=Services.dirsvc.get('ProfD',Ci.nsIFile);file.append(addonName);
  await pane.threadPane.updateThreadItemSize();
  const nativeHeight=pane.customElements.get('thread-card').ROW_HEIGHT;
  const originalBackground=pane.getComputedStyle(pane.document.documentElement).backgroundColor;
  addon=await AddonManager.installTemporaryAddon(file);
  const doc=pane.document;
  await wait(()=>doc.querySelector('.lmc-avatar'));
  await settle();
  const {ExtensionParent}=ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
  const extension=ExtensionParent.GlobalManager.extensionMap.get(id);
  const styleService=Cc['@mozilla.org/content/style-sheet-service;1'].getService(Ci.nsIStyleSheetService);
  const styleURIs=['interface.css','content.css'].map(name=>Services.io.newURI(extension.getURL('styles/'+name)+'?v='+encodeURIComponent(addon.version)));
  const stylesLoaded=()=>styleURIs.every(uri=>styleService.sheetRegistered(uri,styleService.USER_SHEET));
  check('bundled sheets registered without legacy CSS',stylesLoaded()&&!Services.prefs.getBoolPref('toolkit.legacyUserProfileCustomizations.stylesheets',false));
  check('bundled interface paints existing pane',pane.getComputedStyle(pane.document.documentElement).backgroundColor==='rgb(245, 246, 242)');
  const expectedPreview=header=>header.getStringProperty('preview');
  const consistent=()=>{
    const rows=[...doc.querySelectorAll('.lmc-card')];
    return rows.length>0&&rows.every(row=>{
      const header=pane.gDBView.getMsgHdrAt(row.index);
      const expected=expectedPreview(header);
      const preview=row.querySelector('.lmc-preview');
      return row.querySelector('.lmc-avatar').textContent==='AB'&&preview.textContent===(expected||'Preview unavailable')&&preview.hidden===!expected;
    });
  };
  check('extension activates in Thunderbird',addon.isActive);
  await wait(consistent);
  check('native cached preview and initials',consistent());
  const measuredHeight=()=>{
    const rows=[...doc.querySelectorAll('.lmc-card')].sort((a,b)=>a.index-b.index);
    const height=pane.customElements.get('thread-card').ROW_HEIGHT;
    return rows.every((r,i)=>Math.abs(r.getBoundingClientRect().height-height)<1&&(!i||r.index!==rows[i-1].index+1||Math.abs(r.getBoundingClientRect().top-rows[i-1].getBoundingClientRect().bottom)<1));
  };
  check('default three-line height matches native virtual geometry',pane.customElements.get('thread-card').ROW_HEIGHT===nativeHeight&&measuredHeight());
  check('no flag mutations during render',JSON.stringify(flags())===initialFlags);
  check('only local accounts present',Array.from(MailServices.accounts.allServers).every(s=>s.type==='none'));
  const firstRow=doc.querySelector('.lmc-card');
  const firstHeader=pane.gDBView.getMsgHdrAt(firstRow.index);
  const wasRead=firstHeader.isRead;
  const visual=[];
  try {
    for(const read of [false,true]) {
      firstHeader.markRead(read);
      await wait(()=>firstRow.dataset.properties.split(' ').includes('unread')===!read);
      await settle();
      visual.push({read,sender:pane.getComputedStyle(firstRow.querySelector('.sender')).fontWeight,subject:pane.getComputedStyle(firstRow.querySelector('.subject')).fontWeight});
    }
  } finally { firstHeader.markRead(wasRead); await settle(); }
  check('native read and unread typography distinct',visual[0].sender==='700'&&visual[0].subject==='700'&&visual[1].sender==='400'&&visual[1].subject==='400',visual);
  const flagged=()=>Boolean(firstHeader.flags&Ci.nsMsgMessageFlags.Marked);
  const wasFlagged=flagged();
  const click=element=>element.dispatchEvent(new pane.MouseEvent('click',{bubbles:true,button:0,detail:1}));
  click(firstRow.querySelector('.tree-button-flag'));
  await wait(()=>flagged()!==wasFlagged);
  check('native star action works',flagged()!==wasFlagged);
  await settle();
  click(firstRow.querySelector('.tree-button-flag'));
  await wait(()=>flagged()===wasFlagged);
  pane.threadTree.selectedIndex=0;
  pane.threadTree.focus();
  pane.threadTree.querySelector('[is="tree-view-table-body"]').dispatchEvent(new pane.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  check('native keyboard selection works',pane.threadTree.selectedIndex===1);
  await wait(()=>pane.threadTree.getRowAtIndex(1));
  click(pane.threadTree.getRowAtIndex(1).querySelector('.tree-button-more'));
  const menu=doc.getElementById('mailContext');
  await wait(()=>menu.state==='open');
  check('native context menu opens',menu.state==='open');
  menu.hidePopup();
  pane.threadTree.scrollToIndex(39);
  await wait(()=>pane.threadTree.getRowAtIndex(39)?.classList.contains('lmc-card'));
  await wait(consistent);
  check('last virtual row reachable without gaps',measuredHeight());
  check('native scroll recycling',consistent(),[...doc.querySelectorAll('.lmc-card')].filter(row=>{
    const h=pane.gDBView.getMsgHdrAt(row.index),p=row.querySelector('.lmc-preview');
    return p.textContent!==(expectedPreview(h)||'Preview unavailable')||p.hidden!==!expectedPreview(h);
  }).map(row=>({index:row.index,expected:pane.gDBView.getMsgHdrAt(row.index).getStringProperty('preview'),actual:row.querySelector('.lmc-preview').textContent,hidden:row.querySelector('.lmc-preview').hidden})));
  pane.gDBView.sort(Ci.nsMsgViewSortType.byDate,Ci.nsMsgViewSortOrder.ascending);
  pane.threadTree.invalidate();
  await wait(consistent);
  check('native sorting retains matching previews',consistent());
  pane.threadTree.classList.add('cards-row-compact');
  await wait(()=>!doc.querySelector('.lmc-avatar'));
  check('native compact mode removes additions',!doc.querySelector('[data-lmc-active]'));
  pane.threadTree.classList.remove('cards-row-compact');
  await wait(consistent);
  check('native expanded cards resume',consistent());
  pane.threadTree.setAttribute('rows','thread-row');
  await wait(()=>!doc.querySelector('.lmc-avatar,[data-lmc-active]'));
  check('native table untouched',!doc.querySelector('[data-lmc-active]'));
  pane.threadTree.setAttribute('rows','thread-card');
  await wait(()=>doc.querySelector('.lmc-avatar'));
  await addon.disable();
  check('disable unregisters both bundled sheets',styleURIs.every(uri=>!styleService.sheetRegistered(uri,styleService.USER_SHEET)));
  check('disable restores original pane background',pane.getComputedStyle(pane.document.documentElement).backgroundColor===originalBackground);
  check('disable removes all nodes and markers',!doc.querySelector('.lmc-avatar,.lmc-preview,[data-lmc-active]'));
  check('disable removes stylesheet',![...doc.querySelectorAll('link')].some(l=>l.href.includes('/experiment/cards.css')));
  check('disable restores native virtual height',pane.customElements.get('thread-card').ROW_HEIGHT===nativeHeight);
  await addon.enable();
  await wait(stylesLoaded);
  check('re-enable registers bundled sheets',stylesLoaded());
  await wait(consistent);
  check('re-enable restores cards',consistent());
  tabmail.openTab('mail3PaneTab',{folderURI:folder.URI,background:false});
  await wait(()=>tabmail.currentAbout3Pane!==pane&&tabmail.currentAbout3Pane?.document.querySelector('.lmc-avatar'));
  const second=tabmail.currentAbout3Pane;
  check('new tab gets cards',Boolean(second.document.querySelector('.lmc-avatar')));
  await addon.disable();
  check('all tabs cleaned',!doc.querySelector('.lmc-avatar')&&!second.document.querySelector('.lmc-avatar'));
  tabmail.closeTab(tabmail.currentTabInfo);
  await addon.enable();
  await wait(()=>doc.querySelector('.lmc-avatar'));
  pane.threadTree.scrollToIndex(0);
  await settle();
  check('flags unchanged after lifecycle',JSON.stringify(flags())===initialFlags,{before:JSON.parse(initialFlags).filter((h,i)=>h[1]!==flags()[i][1]),after:flags().filter((h,i)=>h[1]!==JSON.parse(initialFlags)[i][1])});
  const errors=Services.console.getMessageArray().filter(m=>/Lime Mail Cards|experiment\/api.js|experiment\/cards.js/.test(m.message)).map(m=>m.message);
  check('no extension errors',errors.length===0,errors);
  return {results,originallyCached,total:headers.length,rows:doc.querySelectorAll('.lmc-card').length};
  } finally { Services.prefs.setBoolPref(indexPref,indexEnabled); }
}
(async()=>{
  const c=await connect(28287,process.env.THUNDERBIRD_TEST_PROFILE);
  try{
    await c.call('WebDriver:SetWindowRect',{width:1600,height:1000});
    const result=await c.executeAsync('const done=arguments[arguments.length-1]; ('+exercise.toString()+')('+JSON.stringify(process.env.TEST_ADDON||'addon-source')+').then(done,e=>done({error:String(e),stack:e.stack}));');
    console.log(JSON.stringify(result.value,null,2));
    assert(!result.value.error,result.value.error);
    assert(result.value.results.every(r=>r.pass),'Native tests failed');
    const shot=await c.call('WebDriver:TakeScreenshot',{id:null,full:true,hash:false});
    if(process.env.SCREENSHOT_FILE)fs.writeFileSync(process.env.SCREENSHOT_FILE,Buffer.from(shot.value,'base64'));
  }finally{await c.close();}
})().catch(e=>{console.error(e);process.exit(1);});
