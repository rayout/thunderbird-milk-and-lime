const assert=require('node:assert/strict');
const connect=require('./marionette.cjs');
async function exercise(){
  const {MailServices}=ChromeUtils.importESModule('resource:///modules/MailServices.sys.mjs');
  const {VirtualFolderHelper}=ChromeUtils.importESModule('resource:///modules/VirtualFolderWrapper.sys.mjs');
  if(!Services.io.offline||!Array.from(MailServices.accounts.allServers).every(s=>s.type==='none'))throw Error('Offline local profile required');
  const pane=document.getElementById('tabmail').currentAbout3Pane,doc=pane.document;
  const folder=pane.gFolder,target=pane.gDBView.getMsgHdrAt(0),original=target.getStringProperty('keywords');
  const root=MailServices.accounts.localFoldersServer.rootFolder,key=':flag999999',name='Tag navigation test';
  if(!MailServices.tags.isValidKey(key))MailServices.tags.addTagForKey(key,name,'#cc3333','');
  const virtual=root.containsChildNamed(name)?root.getChildNamed(name):VirtualFolderHelper.createNewVirtualFolder(name,root,[folder],'AND (tag,contains,'+key+')',false).virtualFolder;
  const wait=async fn=>{const end=Date.now()+4000;while(!fn()){if(Date.now()>end)throw Error('Navigation condition timed out: '+fn);await new Promise(r=>setTimeout(r,30));}};
  const results=[];
  try{
    folder.removeKeywordsFromMessages([target],key);
    const row=pane.threadTree.getRowAtIndex(0);
    await wait(()=>row.querySelector('.lmc-tag-button'));
    row.querySelector('.lmc-tag-button').click();
    await wait(()=>doc.querySelector('.lmc-tag-popup')?.state==='open');
    [...doc.querySelector('.lmc-tag-popup').children].find(item=>item.getAttribute('label')===name).doCommand();
    await wait(()=>target.getStringProperty('keywords').split(' ').includes(key));
    pane.displayFolder(virtual.URI);
    await wait(()=>pane.gFolder?.URI===virtual.URI&&pane.gDBView?.rowCount===1&&pane.threadTree.getRowAtIndex(0)?.querySelector('.lmc-tag'));
    results.push({name:'tag search finds assigned message',pass:pane.gDBView.getMsgHdrAt(0).messageId===target.messageId});
    pane.paneLayout.messagePaneSplitter.isCollapsed=false;
    pane.threadTree.selectedIndex=0;
    target.markRead(true);
    await new Promise(r=>setTimeout(r,800));
    results.push({name:'opening and reading tagged message preserves keywords',pass:target.getStringProperty('keywords').split(' ').includes(key)});
    pane.displayFolder(root.getChildNamed('Важное').URI);
    await new Promise(r=>setTimeout(r,100));
    pane.displayFolder(folder.URI);
    await wait(()=>pane.gFolder?.URI===folder.URI&&pane.gDBView?.rowCount>0);
    pane.threadTree.selectedIndex=0;
    await new Promise(r=>setTimeout(r,500));
    results.push({name:'returning to source folder preserves keyword and visible pill',pass:target.getStringProperty('keywords').split(' ').includes(key)&&doc.querySelector('.lmc-tags')?.textContent.includes(name)});
  }finally{
    folder.removeKeywordsFromMessages([target],key);
    if(original.split(' ').includes(key))folder.addKeywordsToMessages([target],key);
    pane.displayFolder(folder.URI);
  }
  return results;
}
(async()=>{const c=await connect(28287,process.env.THUNDERBIRD_TEST_PROFILE);try{
  const result=(await c.executeAsync('const done=arguments[arguments.length-1];('+exercise.toString()+')().then(done,e=>done({error:String(e),stack:e.stack}));')).value;
  console.log(JSON.stringify(result,null,2));assert(!result.error,result.error);assert(result.every(r=>r.pass));
}finally{await c.close();}})().catch(error=>{console.error(error);process.exit(1);});
