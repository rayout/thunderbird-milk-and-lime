const assert = require('node:assert/strict');
const connect = require('./marionette.cjs');
async function exercise() {
  const {MailServices} = ChromeUtils.importESModule('resource:///modules/MailServices.sys.mjs');
  const {AddonManager} = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const {AddrBookCard} = ChromeUtils.importESModule('resource:///modules/AddrBookCard.sys.mjs');
  if (!Array.from(MailServices.accounts.allServers).every(s => s.type === 'none')) throw Error('Local test accounts required');
  Services.io.offline = true;
  const wait = async fn => { const end = Date.now()+6000; while (!await fn()) { if (Date.now()>end) throw Error('Timed out: '+fn); await new Promise(r=>setTimeout(r,30)); } };
  const id = '{cc82279d-63ff-4802-841b-5026940f9ed8}';
  const old = await AddonManager.getAddonByID(id); if (old) await old.uninstall();
  const file = Services.dirsvc.get('ProfD', Ci.nsIFile); file.append('lime-mail-cards.xpi');
  const addon = await AddonManager.installTemporaryAddon(file);
  const tabmail = document.getElementById('tabmail');
  const book = MailServices.ab.getDirectory('jsaddrbook://abook.sqlite');
  const cards = [], results = [];
  const tab = tabmail.openTab('contentTab', {url:addon.optionsURL, background:true});
  const run = script => tab.browser.browsingContext.currentWindowGlobal.getActor('MarionetteCommands').executeScript('return (async()=>{'+script+'})();', [], {newSandbox:false, timeout:5000});
  const check = (name, pass) => { assertNative(pass, name); results.push(name); };
  function assertNative(pass, name) { if (!pass) throw Error(name); }
  try {
    await wait(()=>run("return document.getElementById('nicknameSenders')?.disabled===false;"));
    await run("document.getElementById('nicknameSenders').value='notifications@example.invalid'; document.getElementById('nicknameForm').requestSubmit();");
    await wait(()=>run("return document.getElementById('status').textContent==='Saved';"));
    check('notification address saved through settings', await run("return (await messenger.storage.local.get('nicknameSenders')).nicknameSenders[0]==='notifications@example.invalid';"));
    const canvas = document.createElementNS('http://www.w3.org/1999/xhtml','canvas'); canvas.width=canvas.height=64;
    canvas.getContext('2d').fillRect(0,0,64,64); const photo=canvas.toDataURL('image/png');
    const add = () => { const card=new AddrBookCard(); card.displayName='Nickname demo'; card.vCardProperties.addValue('nickname','lime_demo'); card.vCardProperties.addValue('photo',photo); const saved=book.addCard(card); cards.push(saved); return saved; };
    add();
    const lookup = () => run("return messenger.LimeCards.getContactPhoto('notifications@example.invalid','lime_demo');");
    await wait(async()=>await lookup()===photo);
    check('real nickname contact without email resolves its local photo',true);
    const root = MailServices.accounts.localFoldersServer.rootFolder;
    if (!root.containsChildNamed('Lime Nicknames')) root.createSubfolder('Lime Nicknames', null);
    const folder = root.getChildNamed('Lime Nicknames').QueryInterface(Ci.nsIMsgLocalMailFolder);
    if (!folder.getTotalMessages(false)) {
      for (const nick of ['lime_demo','unknown_demo']) folder.addMessage([
        'From: Demo (@'+nick+') <notifications@example.invalid>', 'To: test@example.invalid',
        'Subject: Nickname '+nick, 'Message-ID: <'+nick+'@example.invalid>',
        'Date: Fri, 16 Oct 2026 12:00:00 +0300', '', 'Synthetic local test.', '',
      ].join('\r\n'));
    }
    tabmail.switchToTab(0);
    const pane = tabmail.currentAbout3Pane;
    pane.paneLayout.messagePaneSplitter.isCollapsed = true;
    pane.displayFolder(folder.URI);
    pane.threadTree.setAttribute('rows','thread-card');
    const rows = () => [...pane.document.querySelectorAll('.lmc-card')];
    await wait(()=>rows().length===2 && rows().filter(row=>row.querySelector('.lmc-avatar img')?.naturalWidth===64).length===1);
    check('same sender renders photo only on the matching nickname row', rows().find(row=>row.querySelector('.lmc-avatar img')).textContent.includes('Nickname lime_demo'));
    check('unlisted sender cannot use nickname photo',await run("return (await messenger.LimeCards.getContactPhoto('other@example.invalid','lime_demo'))==='';"));
    add();
    await wait(async()=>await lookup()===''); check('duplicate nickname removes cached photo',true);
    await wait(()=>!pane.document.querySelector('.lmc-avatar img'));
    check('ambiguity refreshes the visible list to initials',true);
    book.deleteCards([cards.pop()]);
    await wait(async()=>await lookup()===photo); check('contact deletion restores unique match live',true);
    await run("document.getElementById('nicknameSenders').value=''; document.getElementById('nicknameForm').requestSubmit();");
    await wait(async()=>await lookup()===''); check('clearing setting disables matching live',true);
    return results;
  } finally { for (const card of cards) book.deleteCards([card]); tabmail.closeTab(tab); }
}
(async()=>{
  const client=await connect(28287,process.env.THUNDERBIRD_TEST_PROFILE);
  try {
    const {value}=await client.executeAsync('const done=arguments[arguments.length-1];('+exercise.toString()+')().then(done,e=>done({error:String(e),stack:e.stack}));');
    console.log(JSON.stringify(value,null,2)); assert(!value.error,value.error);
  } finally { await client.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
