// Synthetic local mail only. Profile identity is checked before executing chrome code.
const fs=require('node:fs');
const assert=require('node:assert/strict');
const connect=require('./marionette.cjs');
const english=process.env.SCREENSHOT_LOCALE==='en';
const labels=english?{inbox:'Inbox — demo',important:'Important',attention:'Needs attention',projects:'Projects',reply:'Needs reply',later:'Later'}:{inbox:'Входящие — демо',important:'Важно',attention:'Требует внимания',projects:'Проекты',reply:'Нужен ответ',later:'Отложено'};
const encode=s=>'=?UTF-8?B?'+Buffer.from(s).toString('base64')+'?=';
const examples=english?[
  ['Anna Smith','Portal interface update','Hi! Here are the first design proposals.'],
  ['Michael Brown','Re: Portal interface update','I added a few comments on navigation. The direction looks good!'],
  ['Anna Smith','Re: Portal interface update','The updated interface is ready. Navigation is simpler, and the main actions are easier to find.'],
  ['Documents','Documents ready for approval','Please review the documents and leave your comments before Friday.'],
  ['Michael Brown','Test environment is ready','The environment is ready. Initial checks passed; testing can start.'],
  ['Maria Wilson','Team meeting recap','Here are the decisions and next steps from our meeting.'],
  ['System updates','Certificate check completed','All certificates are valid. No errors found.'],
  ['Daniel Scott','Plan for next week','Let’s agree on priorities for next week.'],
  ['Elena Cooper','Documentation update','New examples and answers to common questions are ready.'],
]:[
  ['Анна Смирнова','Обновление интерфейса портала','Привет! Делюсь первыми вариантами макетов.'],
  ['Михаил Орлов','Re: Обновление интерфейса портала','Добавил несколько комментариев к навигации. В целом направление отличное!'],
  ['Анна Смирнова','Re: Обновление интерфейса портала','Подготовила обновлённый вариант интерфейса. Сделали навигацию проще, а основные действия — заметнее.'],
  ['Документооборот','Документы на согласование: план следующего выпуска','Пожалуйста, проверьте документы и оставьте замечания до пятницы.'],
  ['Михаил Орлов','Готовность тестового стенда','Стенд развёрнут, провели базовые проверки. Можно начинать тестирование.'],
  ['Мария Волкова','Итоги встречи команды — решения и следующие шаги','Спасибо всем за активное обсуждение. Фиксирую договорённости и ближайшие действия.'],
  ['Системные уведомления','Автоматическая проверка сертификатов завершена','Проверка завершена: все сертификаты действительны.'],
  ['Дмитрий Соколов','План работ на следующую неделю','Предлагаю следующий план на предстоящую неделю.'],
  ['Елена Кузнецова','Обновление документации по интеграции','Добавлены новые разделы, примеры и ответы на частые вопросы.'],
];
const fixtures=examples.map(([name,subject,preview],i)=>{
  const body=i===2?(english?'<h2>Hi!</h2><p>'+preview+'</p><h3>What changed</h3><ul><li>Brought key sections together</li><li>Improved readability of the document list</li><li>Added clear approval statuses</li></ul><p>Please take a look before tomorrow’s meeting.</p><p><a href="https://example.invalid/discussion">Open discussion</a></p><p>Anna<br>Product team</p>':'<h2>Привет!</h2><p>'+preview+'</p><h3>Что изменилось</h3><ul><li>Собрали важные разделы в одном месте</li><li>Улучшили читаемость списка документов</li><li>Добавили понятные статусы согласования</li></ul><p>Посмотри, пожалуйста, перед завтрашней встречей.</p><p><a href="https://example.invalid/discussion">Открыть обсуждение</a></p><p>Анна<br>Команда продукта</p>'):'<p>'+preview+'</p>';
  return {preview,name,eml:[
    'X-Mozilla-Status: 0000','X-Mozilla-Status2: 00000000',
    'From: '+encode(name)+' <person'+i+'@example.invalid>',
    'To: Test User <test@example.invalid>',
    'Subject: '+encode(subject),
    'Date: Thu, 15 Oct 2026 '+(i<3?'14:3'+i:String(16-i).padStart(2,'0')+':00')+':00 +0300',
    'Message-ID: <lime-demo-v4-'+i+'@example.invalid>',
    ...(i>0&&i<3?['In-Reply-To: <lime-demo-v4-'+(i-1)+'@example.invalid>','References: <lime-demo-v4-0@example.invalid>']:[]),
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',
    Buffer.from('<!doctype html><html><body style="font:16px/1.6 sans-serif;color:#252b29;background:white">'+body+'</body></html>').toString('base64').match(/.{1,76}/g).join('\r\n'),
    '','',
  ].join('\r\n')};
});
async function setup(fixtures,labels){
  const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const {MailServices}=ChromeUtils.importESModule('resource:///modules/MailServices.sys.mjs');
  Services.io.offline=true;
  if(!Array.from(MailServices.accounts.allServers).every(s=>s.type==='none'))throw Error('Non-local account in test profile');
  Services.prefs.setBoolPref('mailnews.database.global.indexer.enabled',true);
  // Demo artwork is drawn locally and saved as real contact photos, not injected into the screenshot.
  const {AddrBookCard}=ChromeUtils.importESModule('resource:///modules/AddrBookCard.sys.mjs');
  const book=MailServices.ab.getDirectory('jsaddrbook://abook.sqlite');
  for(let i=0;i<fixtures.length;i++){
    const address='person'+i+'@example.invalid';
    const existing=book.cardForEmailAddress(address);
    const canvas=document.createElementNS('http://www.w3.org/1999/xhtml','canvas');
    canvas.width=canvas.height=96;
    const ctx=canvas.getContext('2d');
    const palette=[['#e1ead1','#698740'],['#dce8eb','#416b76'],['#e1ead1','#698740'],['#f4e9cc','#967126']];
    const [bg,shirt]=palette[i%4];
    ctx.fillStyle=bg;ctx.fillRect(0,0,96,96);
    ctx.fillStyle=shirt;ctx.beginPath();ctx.ellipse(48,96,34,36,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#403a34';ctx.beginPath();ctx.ellipse(48,38,23,27,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#e5b68b';ctx.beginPath();ctx.ellipse(48,43,17,21,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#403a34';ctx.beginPath();ctx.ellipse(46,24,20,12,-0.2,0,Math.PI*2);ctx.fill();
    ctx.fillRect(40,40,3,3);ctx.fillRect(53,40,3,3);
    ctx.strokeStyle='#935e46';ctx.lineWidth=2;ctx.beginPath();ctx.arc(48,48,7,0.2,Math.PI-0.2);ctx.stroke();
    if(i===3||i===6){
      ctx.fillStyle=bg;ctx.fillRect(0,0,96,96);
      ctx.strokeStyle=shirt;ctx.lineWidth=5;ctx.strokeRect(28,19,40,56);
      ctx.beginPath();ctx.moveTo(37,34);ctx.lineTo(59,34);ctx.moveTo(37,45);ctx.lineTo(59,45);ctx.moveTo(37,56);ctx.lineTo(53,56);ctx.stroke();
    }
    const card=existing||new AddrBookCard();card.displayName=fixtures[i].name;card.primaryEmail=address;
    card.vCardProperties.clearValues('photo');
    card.vCardProperties.addValue('photo',canvas.toDataURL('image/png'));
    if(existing)book.modifyCard(card);else book.addCard(card);
  }
  const install=async (name,id)=>{if((await AddonManager.getAddonByID(id))?.isActive)return;const file=Services.dirsvc.get('ProfD',Ci.nsIFile);file.append(name);return AddonManager.installTemporaryAddon(file);};
  await install('theme.xpi','milk-lime-theme@themes.local');
  await install('lime-mail-cards.xpi','{cc82279d-63ff-4802-841b-5026940f9ed8}');
  await install('conversations.xpi','gconversation@xulforum.org');
  const root=MailServices.accounts.localFoldersServer.rootFolder;
  const account=MailServices.accounts.findAccountForServer(root.server);
  if(!account.identities.length){
    const identity=MailServices.accounts.createIdentity();
    identity.email='test@example.invalid';identity.fullName='Test User';
    account.addIdentity(identity);
  }
  const getFolder=name=>{if(!root.containsChildNamed(name))root.createSubfolder(name,null);return root.getChildNamed(name);};
  const folder=getFolder(labels.inbox);
  for(const old of root.subFolders) if(old.name.startsWith('Входящие')&&old.URI!==folder.URI)old.clearFlag(Ci.nsMsgFolderFlags.Favorite);
  getFolder(labels.important).setFlag(Ci.nsMsgFolderFlags.Favorite);
  getFolder(labels.attention).setFlag(Ci.nsMsgFolderFlags.Favorite);
  getFolder(labels.projects);
  folder.setFlag(Ci.nsMsgFolderFlags.Favorite);
  if(!folder.getTotalMessages(false)) for(const fixture of fixtures)folder.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage(fixture.eml);
  for(const [key,name,color] of [['lime-demo-reply',labels.reply,'#7b9d28'],['lime-demo-important',labels.important,'#b08023'],['lime-demo-later',labels.later,'#6d75ad']]){
    if(!MailServices.tags.isValidKey(key))MailServices.tags.addTagForKey(key,name,color,'');
  }
  for(const header of folder.messages){
    const i=Number(header.messageId.match(/lime-demo-v4-(\d+)/)?.[1]);
    header.setStringProperty('preview',i>=4&&i%2===0?'':fixtures[i].preview);
    header.markRead(i!==2&&i!==3);header.markFlagged(i===5);
    const tag=i===0?'lime-demo-reply':i===3?'lime-demo-important':i===5?'lime-demo-later':'';
    if(tag)folder.addKeywordsToMessages([header],tag);
  }
  const tabmail=document.getElementById('tabmail');
  for(const tab of [...tabmail.tabInfo].slice(1))tabmail.closeTab(tab);
  const pane=tabmail.currentAbout3Pane;
  pane.displayFolder(folder.URI);
  pane.gViewWrapper.showThreaded=true;
  const {GlodaMsgIndexer}=ChromeUtils.importESModule('resource:///modules/gloda/IndexMsg.sys.mjs');
  const {GlodaIndexer}=ChromeUtils.importESModule('resource:///modules/gloda/GlodaIndexer.sys.mjs');
  // Let the synthetic local-only profile index without enabling networking.
  if(!Array.from(MailServices.accounts.allServers).every(s=>s.type==='none'))throw Error('Non-local account in test profile');
  GlodaIndexer.suppressIndexing=false;
  GlodaMsgIndexer.indexFolder(folder);
  const deadline=Date.now()+10000;
  while(Array.from(folder.messages).some(h=>!h.getUint32Property('gloda-id'))){
    if(Date.now()>deadline)throw Error('Synthetic mail indexing timed out');
    await new Promise(r=>setTimeout(r,100));
  }
  pane.folderPane.activeModes=['favorite','all'];
  const favoriteRoot=pane.document.querySelector('[data-mode="favorite"] li.collapsed .twisty');
  favoriteRoot?.click();
  pane.displayFolder(folder.URI);
  pane.paneLayout.messagePaneSplitter.isCollapsed=false;
  pane.paneLayout.folderPaneSplitter.width=290;
  pane.paneLayout.messagePaneSplitter.width=740;
  pane.threadTree.setAttribute('rows','thread-card');
  const viewDeadline=Date.now()+4000;
  while(!pane.threadTree._selection || !pane.gDBView?.rowCount){
    if(Date.now()>viewDeadline)throw Error('Demo folder view not ready');
    await new Promise(r=>setTimeout(r,50));
  }
  pane.gDBView.sort(Ci.nsMsgViewSortType.byDate,Ci.nsMsgViewSortOrder.descending);
  pane.gDBView.doCommand(Ci.nsMsgViewCommandType.collapseAll);
  pane.threadTree.selectedIndex=-1;
  await new Promise(r=>setTimeout(r,300));
  pane.threadTree.selectedIndex=0;
  pane.threadTree.focus();
  return {folder:folder.URI,count:folder.getTotalMessages(false)};
}
(async()=>{
  const c=await connect(28287,process.env.THUNDERBIRD_TEST_PROFILE);
  try{
    await c.call('WebDriver:SetWindowRect',{width:1600,height:1000});
    const result=await c.executeAsync('const done=arguments[arguments.length-1]; ('+setup.toString()+')('+JSON.stringify(fixtures)+','+JSON.stringify(labels)+').then(done,e=>done({error:String(e),stack:e.stack}));');
    console.log(JSON.stringify(result.value,null,2));
    if(result.value.error)throw Error(result.value.error);
    await c.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),2500);');
    await c.execute(`const tabmail=document.getElementById('tabmail');for(const tab of [...tabmail.tabInfo].slice(1))tabmail.closeTab(tab);return true;`);
    await c.execute(`const reader=document.getElementById('tabmail').currentAbout3Pane.document.getElementById('multiMessageBrowser').contentDocument;reader.scrollingElement.scrollTop=0;return true;`);
    await c.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),500);');
    const state=(await c.execute(`const p=document.getElementById('tabmail').currentAbout3Pane;const d=p.document.getElementById('multiMessageBrowser').contentDocument;return {locale:Services.locale.appLocaleAsBCP47,photos:p.document.querySelectorAll('.lmc-avatar img').length,reader:d.documentURI,messages:d.querySelectorAll('.message').length,legacy:Services.prefs.getBoolPref('toolkit.legacyUserProfileCustomizations.stylesheets',false)};`)).value;
    console.log(JSON.stringify(state));
    assert(state.locale.startsWith(english?'en':'ru'));
    assert(state.photos>0,'Real avatar images required');
    assert(state.reader.includes('conversations/'),'Conversations must render the reader');
    assert(state.messages>=3,'Expected the complete synthetic thread');
    assert.equal(state.legacy,false);
    const shot=await c.call('WebDriver:TakeScreenshot',{id:null,full:true,hash:false});
    if(process.env.SCREENSHOT_FILE)fs.writeFileSync(process.env.SCREENSHOT_FILE,Buffer.from(shot.value,'base64'));
  }finally{await c.close();}
})().catch(e=>{console.error(e);process.exit(1);});
