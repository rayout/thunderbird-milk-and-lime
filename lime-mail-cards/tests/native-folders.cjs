const assert=require('node:assert/strict');
const connect=require('./marionette.cjs');
async function exercise(){
  const {MailServices}=ChromeUtils.importESModule('resource:///modules/MailServices.sys.mjs');
  if(!Array.from(MailServices.accounts.allServers).every(s=>s.type==='none'))throw Error('Local-only profile required');
  const root=MailServices.accounts.localFoldersServer.rootFolder;
  const get=(parent,name)=>{if(!parent.containsChildNamed(name))parent.createSubfolder(name,null);return parent.getChildNamed(name);};
  const parent=get(root,'Folder ordering test');
  const a=get(parent,'A normal'),b=get(parent,'B important');
  const pane=document.getElementById('tabmail').currentAbout3Pane;
  const original=pane.gFolder.URI,index=pane.threadTree.selectedIndex;
  const orders=[a.userSortOrder,b.userSortOrder];
  const uris=[a.URI,b.URI];
  const favorite=Ci.nsMsgFolderFlags.Favorite;
  const flags=[a.flags,b.flags];
  const results=[];
  try{
    a.setFlag(favorite);b.setFlag(favorite);
    pane.folderPane.activeModes=['favorite','all'];
    pane.folderPane.insertFolder(b,a,false);
    await new Promise(r=>setTimeout(r,100));
    results.push({name:'native sibling order changes without moving folders',pass:b.sortOrder<a.sortOrder&&a.URI===uris[0]&&b.URI===uris[1]&&a.parent.URI===parent.URI&&b.parent.URI===parent.URI});
    const rows=[...pane.document.querySelectorAll('li[is="folder-tree-row"]')].filter(r=>r.modeName==='favorite').map(r=>r.uri);
    results.push({name:'favorite folders inherit native sibling order',pass:rows.indexOf(b.URI)>=0&&rows.indexOf(b.URI)<rows.indexOf(a.URI)});
    pane.displayFolder(a.URI);
    await new Promise(r=>setTimeout(r,100));
    results.push({name:'empty folder has no stale cards',pass:pane.gDBView.rowCount===0&&!pane.document.querySelector('.lmc-avatar')});
  }finally{
    a.userSortOrder=orders[0];b.userSortOrder=orders[1];
    if(!(flags[0]&favorite))a.clearFlag(favorite);
    if(!(flags[1]&favorite))b.clearFlag(favorite);
    pane.folderPane.refreshFolderPaneUI(a);
    pane.displayFolder(original);
    pane.threadTree.selectedIndex=index;
  }
  return results;
}
(async()=>{const c=await connect(28287,process.env.THUNDERBIRD_TEST_PROFILE);try{
  const result=(await c.executeAsync('const done=arguments[arguments.length-1];('+exercise.toString()+')().then(done,e=>done({error:String(e),stack:e.stack}));')).value;
  console.log(JSON.stringify(result,null,2));assert(!result.error,result.error);assert(result.every(r=>r.pass));
}finally{await c.close();}})().catch(e=>{console.error(e);process.exit(1);});
