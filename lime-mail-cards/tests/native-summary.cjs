const assert = require('node:assert/strict');
const connect = require('./marionette.cjs');
async function exercise() {
  const {MailServices} = ChromeUtils.importESModule('resource:///modules/MailServices.sys.mjs');
  const {AddonManager} = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  if (!Services.io.offline || !Array.from(MailServices.accounts.allServers).every(s => s.type === 'none')) throw Error('Offline local profile required');
  const tabmail = document.getElementById('tabmail');
  tabmail.switchToTab(0);
  const pane = tabmail.currentAbout3Pane;
  const previousFolder = pane.gFolder.URI;
  const folder = MailServices.accounts.localFoldersServer.rootFolder.getChildNamed('Входящие — образец');
  const headers = Array.from(folder.messages).filter(h => /^lime-demo-v3-[012]@/.test(h.messageId)).sort((a,b) => a.date-b.date);
  if (headers.length !== 3) throw Error('Run native-demo fixture first');
  const originals = headers.map(h => ({keywords:h.getStringProperty('keywords'), preview:h.getStringProperty('preview'), author:h.author, read:h.isRead, flagged:h.isFlagged}));
  const [first, second, last] = headers;
  const tagA = MailServices.tags.getAllTags()[0], tagB = MailServices.tags.getAllTags()[1];
  const addon = await AddonManager.getAddonByID('{cc82279d-63ff-4802-841b-5026940f9ed8}');
  const wait = async fn => { const end=Date.now()+4000; while (!fn()) { if(Date.now()>end) throw Error('Summary condition timed out: '+fn); await new Promise(r=>setTimeout(r,30)); } };
  const results = [], check = (name, pass) => results.push({name,pass:Boolean(pass)});
  pane.paneLayout.messagePaneSplitter.isCollapsed = true;
  pane.displayFolder(folder.URI);
  await wait(() => pane.gFolder?.URI === folder.URI && pane.gDBView?.rowCount);
  const wasThreaded = pane.gViewWrapper.showThreaded;
  const rowFor = header => pane.threadTree.getRowAtIndex(pane.gDBView.findIndexOfMsgHdr(header,false));
  const has = (header,key) => header.getStringProperty('keywords').split(' ').includes(key);
  try {
    for (const h of headers) folder.removeKeywordsFromMessages([h], h.getStringProperty('keywords'));
    first.setStringProperty('preview','First message preview');
    last.setStringProperty('preview','Latest message preview');
    last.author = 'Newest Sender <newest@example.invalid>';
    pane.gViewWrapper.showThreaded = true;
    pane.gDBView.sort(Ci.nsMsgViewSortType.byDate,Ci.nsMsgViewSortOrder.descending);
    pane.gDBView.doCommand(Ci.nsMsgViewCommandType.collapseAll);
    pane.threadTree.selectedIndex = -1;
    pane.threadTree.scrollToIndex(0);
    await wait(() => rowFor(first)?.querySelector('.lmc-preview'));
    await new Promise(r=>setTimeout(r,200));
    check('collapsed card shows latest preview', rowFor(first).querySelector('.lmc-preview').textContent === 'Latest message preview');
    check('collapsed card shows latest reply subject', rowFor(first).querySelector('.subject').textContent.startsWith('Re: '));
    check('collapsed card shows latest sender', rowFor(first).querySelector('.sender').textContent.includes('Newest Sender'));
    check('collapsed card shows latest time', rowFor(first).querySelector('.date').textContent.includes(':32'));
    folder.addKeywordsToMessages([first,last],tagA.key);
    folder.addKeywordsToMessages([second],tagB.key);
    await wait(() => rowFor(first)?.querySelector('.lmc-tags')?.textContent.includes(tagB.tag));
    check('hidden reply tags update collapsed summary', rowFor(first).querySelector('.lmc-tags').textContent.includes(tagA.tag));
    const pill = [...rowFor(first).querySelectorAll('.lmc-tag')].find(p => p.textContent === tagA.tag);
    pill.querySelector('.lmc-tag-remove').click();
    await wait(() => !has(first,tagA.key) && !has(last,tagA.key));
    check('summary cross removes selected tag from entire thread only', has(second,tagB.key));
    check('summary cross preserves selection, read and starred state', pane.threadTree.selectedIndex === -1 && headers.every((h,i) => h.isRead === originals[i].read && h.isFlagged === originals[i].flagged));
    pane.gDBView.doCommand(Ci.nsMsgViewCommandType.expandAll);
    await wait(() => rowFor(second)?.querySelector('.lmc-tag-remove'));
    check('expanded root restores own subject and preview', !rowFor(first).querySelector('.subject').textContent.startsWith('Re: ') && rowFor(first).querySelector('.lmc-preview').textContent === 'First message preview');
    folder.addKeywordsToMessages([first],tagB.key);
    rowFor(second).querySelector('.lmc-tag-remove').click();
    await wait(() => !has(second,tagB.key));
    check('expanded cross removes tag from this message only', has(first,tagB.key));
    pane.gDBView.doCommand(Ci.nsMsgViewCommandType.collapseAll);
    await wait(() => rowFor(first)?.querySelector('.subject')?.textContent.startsWith('Re: '));
    await addon.disable();
    check('disable restores native root subject', !rowFor(first).querySelector('.subject').textContent.startsWith('Re: ') && !rowFor(first).querySelector('.lmc-tags'));
  } finally {
    await addon.enable();
    for (const [i,h] of headers.entries()) {
      folder.removeKeywordsFromMessages([h],h.getStringProperty('keywords'));
      if(originals[i].keywords) folder.addKeywordsToMessages([h],originals[i].keywords);
      h.setStringProperty('preview',originals[i].preview);
      h.author = originals[i].author;
    }
    pane.gViewWrapper.showThreaded = wasThreaded;
    pane.displayFolder(previousFolder);
  }
  return results;
}
(async () => {
  const c = await connect(28287,process.env.THUNDERBIRD_TEST_PROFILE);
  try {
    const {value} = await c.executeAsync('const done=arguments[arguments.length-1];('+exercise.toString()+')().then(done,e=>done({error:String(e),stack:e.stack}));');
    console.log(JSON.stringify(value,null,2));
    assert(!value.error,value.error);
    assert(value.every(r=>r.pass));
  } finally { await c.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
