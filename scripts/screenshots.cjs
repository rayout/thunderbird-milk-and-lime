// Synthetic fixtures only. marionette.cjs verifies the exact disposable profile.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const connect = require('../lime-mail-cards/tests/marionette.cjs');
const root = path.join(__dirname, '..');
const locale = process.env.SCREENSHOT_LOCALE || 'en';
assert(['en', 'ru'].includes(locale));
const copy = locale === 'ru' ? {
  inbox:'Входящие', account:'Локальные папки', name:'Анна Смирнова', other:'Михаил Орлов',
  subjects:['Обновление интерфейса портала','Документы на согласование','Готовность тестового стенда','План работ на следующую неделю','Итоги встречи команды','Проверка сертификатов завершена','Новая версия документации'],
  previews:['Подготовила обновлённый вариант. Посмотри перед встречей.','Проверь, пожалуйста, финальную версию документов.','Стенд готов — можно начинать проверку.','Предлагаю обсудить приоритеты на неделю.','Собрал решения и ближайшие действия.','Все сертификаты действуют, ошибок нет.','Добавлены примеры и ответы на вопросы.'],
  hello:'Привет!', heading:'Что изменилось', body:'Сделали навигацию проще, а основные действия — заметнее.',
  bullets:['Собрали важные разделы в одном месте','Улучшили читаемость списка документов','Добавили понятные статусы согласования'],
  closing:'Посмотри, пожалуйста, перед завтрашней встречей.',link:'Открыть обсуждение',tag:'Нужен ответ',tag2:'Важно',
} : {
  inbox:'Inbox', account:'Local Folders', name:'Anna Smith', other:'Michael Brown',
  subjects:['Portal interface update','Documents ready for approval','Test environment is ready','Plan for next week','Team meeting recap','Certificate check completed','Documentation update'],
  previews:['The updated design is ready. Take a look before our meeting.','Please review the final version of the documents.','The environment is ready for testing.','Let’s agree on the priorities for next week.','Here are the decisions and next steps.','All certificates are valid. No errors found.','New examples and answers to common questions.'],
  hello:'Hi!', heading:'What changed', body:'Navigation is simpler, and the main actions are easier to find.',
  bullets:['Brought key sections together','Improved readability of the document list','Added clear approval statuses'],
  closing:'Please take a look before tomorrow’s meeting.',link:'Open discussion',tag:'Needs reply',tag2:'Important',
};
async function seed(copy) {
  const {MailServices} = ChromeUtils.importESModule('resource:///modules/MailServices.sys.mjs');
  const {AddonManager} = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const cards = await AddonManager.getAddonByID('{cc82279d-63ff-4802-841b-5026940f9ed8}');
  if (cards) await cards.uninstall();
  Services.io.offline = true;
  if ([...MailServices.accounts.allServers].some(s => s.type !== 'none')) throw Error('Refusing real accounts');
  if (![...MailServices.accounts.allServers].some(s => s.type === 'none')) MailServices.accounts.createLocalMailAccount();
  const rootFolder = MailServices.accounts.localFoldersServer.rootFolder;
  rootFolder.server.prettyName = copy.account;
  const account = MailServices.accounts.findAccountForServer(rootFolder.server);
  if (!account.identities.length) {
    const identity = MailServices.accounts.createIdentity();
    identity.email = 'demo@example.invalid'; identity.fullName = 'Demo'; account.addIdentity(identity);
  }
  if (!rootFolder.containsChildNamed(copy.inbox)) rootFolder.createSubfolder(copy.inbox, null);
  const folder = rootFolder.getChildNamed(copy.inbox);
  const encode = text => '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(text))) + '?=';
  const body = '<html><body style="font:16px/1.6 sans-serif;color:#252b29;background:white;padding:12px">'+
    '<p>'+copy.hello+'</p><p>'+copy.previews[0]+'</p><p>'+copy.body+'</p><h3>'+copy.heading+'</h3><ul>'+copy.bullets.map(x=>'<li>'+x+'</li>').join('')+
    '</ul><p>'+copy.closing+'</p><p><a href="https://example.invalid/discussion">'+copy.link+'</a></p><p>'+copy.name+'</p></body></html>';
  if (!folder.getTotalMessages(false)) copy.subjects.forEach((subject,i) => {
    const author = i % 2 ? copy.other : copy.name;
    folder.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage([
      'X-Mozilla-Status: 0000', 'X-Mozilla-Status2: 00000000', 'From: '+encode(author)+' <person'+i+'@example.invalid>',
      'To: Demo <demo@example.invalid>', 'Subject: '+encode(subject), 'Message-ID: <public-'+i+'@example.invalid>',
      'Date: Fri, 16 Oct 2026 '+(14-i)+':30:00 +0000', 'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
      btoa(unescape(encodeURIComponent(i===0 ? body : '<p>'+copy.previews[i]+'</p>'))).match(/.{1,76}/g).join('\r\n'), '', '',
    ].join('\r\n'));
  });
  const headers = [...folder.messages];
  headers.forEach((h,i) => { h.setStringProperty('preview',copy.previews[i]); h.markRead(i>1); });
  MailServices.tags.addTagForKey('needs-reply',copy.tag,'#6c8d32','');
  MailServices.tags.addTagForKey('important',copy.tag2,'#ad7619','');
  folder.addKeywordsToMessages([headers[0]],'needs-reply');
  folder.addKeywordsToMessages([headers[1]],'important');
  const file = Services.dirsvc.get('ProfD',Ci.nsIFile); file.append('theme.xpi');
  const theme = await AddonManager.installTemporaryAddon(file); await theme.enable();
  const tabs = document.getElementById('tabmail');
  for (const tab of [...tabs.tabInfo].slice(1)) tabs.closeTab(tab);
  const pane = tabs.currentAbout3Pane;
  pane.displayFolder(folder.URI);
  pane.threadTree.setAttribute('rows','thread-card');
  pane.paneLayout.messagePaneSplitter.isCollapsed=false;
  pane.paneLayout.folderPaneSplitter.width=240;
  pane.paneLayout.messagePaneSplitter.width=650;
  return {count:headers.length, locale:Services.locale.appLocaleAsBCP47};
}
(async () => {
  const c = await connect(28287, process.env.THUNDERBIRD_TEST_PROFILE);
  const output = path.join(root,'docs/screenshots'); fs.mkdirSync(output,{recursive:true});
  const asyncRun = async code => {
    const result = (await c.executeAsync('const done=arguments[arguments.length-1];(async()=>{'+code+'})().then(done,e=>done({error:String(e)}));')).value;
    assert(!result?.error, result?.error); return result;
  };
  const settle = () => asyncRun('await new Promise(r=>setTimeout(r,700)); return true;');
  try {
    await c.call('WebDriver:SetWindowRect',{width:1440,height:960});
    const data = await asyncRun('return await ('+seed.toString()+')('+JSON.stringify(copy)+');');
    assert.equal(data.count,7); assert(data.locale.startsWith(locale), JSON.stringify(data));
    await settle();
    await c.execute('const p=document.getElementById("tabmail").currentAbout3Pane;p.threadTree.selectedIndex=0;');
    await settle();
    for (const kind of ['theme','cards']) {
      if (kind === 'cards') {
        await asyncRun('const {AddonManager}=ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");const f=Services.dirsvc.get("ProfD",Ci.nsIFile);f.append("addon-source");await AddonManager.installTemporaryAddon(f);return true;');
        await settle();
      }
      const state = (await c.execute('const p=document.getElementById("tabmail").currentAbout3Pane;return {rows:p.gDBView.rowCount,avatars:p.document.querySelectorAll(".lmc-avatar").length,customCSS:Services.prefs.getBoolPref("toolkit.legacyUserProfileCustomizations.stylesheets",false)};')).value;
      assert.equal(state.rows,7); assert.equal(state.customCSS,false);
      assert.equal(state.avatars>0,kind==='cards');
      const image = await c.call('WebDriver:TakeScreenshot',{full:false});
      const bytes = Buffer.from(image.value || image,'base64');
      assert(bytes.subarray(1,4).equals(Buffer.from('PNG')));
      fs.writeFileSync(path.join(output,kind+'-'+locale+'.png'),bytes);
      console.log(kind,locale,JSON.stringify(state));
    }
  } finally { await c.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
