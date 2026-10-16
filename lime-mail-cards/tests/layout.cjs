const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const browser=require('./browser.cjs');
const postcss=require('postcss');
const native=name=>execFileSync('unzip',['-p',process.env.THUNDERBIRD_OMNI,name],{encoding:'utf8'});
const template=native('chrome/messenger/content/messenger/about3Pane.xhtml').match(/<template id="threadPaneCardTemplate">([\s\S]*?)<\/template>/)[1];
const root=path.join(__dirname,'..');
const script=fs.readFileSync(path.join(root,'experiment/cards.js'),'utf8');
const tagScript=fs.readFileSync(path.join(root,'experiment/tags.js'),'utf8');
const sheet=path.join(root,'experiment/cards.css');
const css=fs.existsSync(sheet)?fs.readFileSync(sheet,'utf8'):'';
const milk=postcss.parse(fs.readFileSync(path.join(root,'styles/interface.css'),'utf8'));
milk.walkAtRules('-moz-document',r=>r.replaceWith(...r.nodes));
const nativeCSS=native('chrome/classic/skin/classic/messenger/shared/tree-listbox.css')+native('chrome/classic/skin/classic/messenger/shared/threadCard.css');
const exercise=async function(){
  const checks=[];
  const check=(name,pass,detail)=>checks.push({name,pass:Boolean(pass),detail});
  const tick=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  try {
    const tree=document.querySelector('#threadTree'),row=document.querySelector('tr');
    row.index=0;
    row.style.fontWeight='700';
    const sender=row.querySelector('.sender'),date=row.querySelector('.date'),subject=row.querySelector('.subject');
    sender.textContent='Анна Смирнова — длинное имя получателя';date.textContent='15.10.2026, 17:10';
    subject.textContent='Очень длинная тема: согласование изменений и работа с новой версией приложения';
    row.querySelector('.thread-replies').textContent='12';
    const tags=row.querySelector('thread-card-tags');tags.textContent='Важное';
    tags.style.cssText='display:inline-block;max-width:40px;overflow:hidden';
    const baseline=row.getBoundingClientRect().height;
    const record={key:'a',displayName:sender.textContent,preview:'Описание задачи и ближайшие действия, длинная строка для проверки обрезки.'};
    window.gDBView={rowCount:1,getMsgHdrAt:()=>({folder:{URI:'local'},messageKey:1,messageId:'one'})};
    const tagController=LimeTags.create(window,{label:'Метки письма',tagService:{getAllTags:()=>[
      {key:'important',tag:'Важно',color:'#cc3333'},
      {key:'reply',tag:'Нужен ответ',color:'#3355cc'},
      {key:'later',tag:'Отложено',color:'#663399'},
    ],isValidKey:()=>true}});
    const settings={separateTags:true};
    const stop=LimeCards.attach(window,{settings,missingPreview:'Нет превью',readRow:()=>record,tags:tagController});
    await tick();
    for(const font of [15,18]) for(const width of [320,460]){
      document.documentElement.style.fontSize=font+'px';
      tree.style.width=width+'px';
      await tick();
      const s=sender.getBoundingClientRect(),d=date.getBoundingClientRect(),t=subject.getBoundingClientRect();
      const p=row.querySelector('.lmc-preview').getBoundingClientRect(),c=row.querySelector('.card-container').getBoundingClientRect();
      const id=width+'/'+font;
      check('subject then preview then metadata '+id,t.bottom<=p.top+1&&p.bottom<=s.top+1,{s,t,p});
      check('date does not overlap sender '+id,s.right<=d.left+1&&d.right<=c.right+1);
      const column=getComputedStyle(row.querySelector('.thread-card-column:not(.read-status-column)'));
      check('three lines fit native card '+id,t.top>=c.top&&s.bottom<=c.bottom+1,{p,c,display:column.display,columns:column.gridTemplateColumns,rows:column.gridTemplateRows});
      check('preview single line '+id,p.height<=font*1.5);
      check('commands stay inside '+id,[...row.querySelectorAll('.thread-card-icon-info,.thread-card-button,.tree-button-more')].every(el=>{const b=el.getBoundingClientRect();return b.width===0||(b.left>=c.left&&b.right<=c.right+1&&b.bottom<=c.bottom+1);}));
      check('text is visible '+id,t.width>20&&p.width>80);
      const avatar=row.querySelector('.lmc-avatar').getBoundingClientRect();
      if(avatar.width) {
        const lane=parseFloat(getComputedStyle(row.querySelector('.card-container')).gridTemplateColumns.split(' ')[0]);
        check('avatar centered horizontally in its own column '+id,Math.abs(avatar.left+avatar.width/2-(c.left+parseFloat(getComputedStyle(row.querySelector('.card-container')).borderLeftWidth)+lane/2))<2);
        check('avatar centered vertically '+id,Math.abs((avatar.top+avatar.bottom)-(c.top+c.bottom))<2,{avatar,c});
        check('avatar has clear gap before text '+id,t.left-avatar.right>=8,{avatar,t});
      }
    }
    document.documentElement.style.fontSize='15px';tree.style.width='460px';
    await tick();
    check('height unchanged',Math.abs(row.getBoundingClientRect().height-baseline)<1);
    check('decorative avatar not focusable',row.querySelector('.lmc-avatar').getAttribute('aria-hidden')==='true'&&!row.querySelector('.lmc-avatar').hasAttribute('tabindex'));
    check('preview and date do not inherit unread bold weight',getComputedStyle(row.querySelector('.lmc-preview')).fontWeight==='400'&&getComputedStyle(date).fontWeight==='400');
    check('unread subject remains bold',getComputedStyle(subject).fontWeight==='700');
    const unreadSenderWeight=Number(getComputedStyle(sender).fontWeight);
    row.dataset.properties='read';row.style.fontWeight='';
    await tick();
    check('read sender is visibly lighter than unread',Number(getComputedStyle(sender).fontWeight)<=400&&unreadSenderWeight>=600);
    check('read subject is regular',getComputedStyle(subject).fontWeight==='400');
    check('subject larger than sender',parseFloat(getComputedStyle(subject).fontSize)>parseFloat(getComputedStyle(sender).fontSize));
    row.classList.add('selected');row.dataset.properties='unread';
    await tick();
    check('selected unread stays bold',getComputedStyle(subject).fontWeight==='700');
    row.dataset.properties='read';
    await tick();
    check('selected read stays regular',getComputedStyle(subject).fontWeight==='400');
    record.preview='';subject.textContent+=' без сохранённого превью';
    await tick();
    const twoLine=subject.getBoundingClientRect(),meta=sender.getBoundingClientRect();
    check('missing preview uses space for two-line subject',twoLine.height>parseFloat(getComputedStyle(subject).lineHeight)*1.6&&twoLine.bottom<=meta.top+1,{twoLine,meta});
    check('missing preview takes no visual space',row.querySelector('.lmc-preview').getBoundingClientRect().height===0);
    check('missing preview preserves virtual row height',Math.abs(row.getBoundingClientRect().height-baseline)<1);
    tags.setAttribute('tags','important reply later');
    record.preview='Есть превью вместе с метками';subject.textContent+=' tagged';
    await tick();
    for(const width of [320,460]){
      tree.style.width=width+'px';await tick();
      const pills=row.querySelector('.lmc-tags'),button=row.querySelector('.lmc-tag-button');
      const t=subject.getBoundingClientRect(),p=pills?.getBoundingClientRect(),s=sender.getBoundingClientRect(),c=row.querySelector('.card-container').getBoundingClientRect();
      check('named pills between subject and sender '+width,p&&p.height>0&&p.top>=t.bottom-1&&p.bottom<=s.top+1,{t,p,s});
      check('all tag names available '+width,pills?.getAttribute('aria-label')?.includes('Отложено')&&pills?.textContent.includes('Нужен ответ'));
      check('tag quick action visible '+width,button&&button.getBoundingClientRect().width>=20&&button.getBoundingClientRect().right<=c.right+1);
      check('remove crosses remain visible inside pills '+width,[...pills.querySelectorAll('.lmc-tag-remove')].every(b=>{
        const r=b.getBoundingClientRect(),pill=b.parentElement.getBoundingClientRect();
        return r.width>=16&&r.height>=16&&r.left>=pill.left&&r.right<=pill.right&&r.bottom<=pill.bottom;
      }));
      check('tags do not increase row height '+width,Math.abs(row.getBoundingClientRect().height-baseline)<1);
      const excerpt=row.querySelector('.lmc-preview').getBoundingClientRect();
      check('four lines: subject, tags, preview, metadata '+width,excerpt.height>0&&p.bottom<=excerpt.top+1&&excerpt.bottom<=s.top+1,{t,p,excerpt,s});
      check('preview is announced alongside tags '+width,row.getAttribute('aria-describedby').split(' ').includes(row.querySelector('.lmc-preview').id));
    }
    settings.separateTags=false;
    window.dispatchEvent(new Event('lmc-layout-changed'));
    await tick();
    check('option off: tags replace preview',row.querySelector('.lmc-preview').getBoundingClientRect().height===0&&row.querySelector('.lmc-tags').getBoundingClientRect().height>0);
    const tagsRect=row.querySelector('.lmc-tags').getBoundingClientRect(),senderRect=sender.getBoundingClientRect();
    check('option off: tags remain between subject and metadata',tagsRect.top>=subject.getBoundingClientRect().bottom-1&&tagsRect.bottom<=senderRect.top+1);
    stop();await tick();
    check('original theme restored on disable',!tree.hasAttribute('data-lmc-active')&&!row.querySelector('.lmc-preview'));
  }catch(error){check(error.message,false);}
  await fetch('/result',{method:'POST',body:JSON.stringify(checks)});
};
(async()=>{
  for(const mode of ['light','dark','milk','contrast']){
    const extra=mode==='contrast'?['--force-high-contrast']:[];
    const html='<!doctype html><meta charset=utf-8><style>html{font:15px Arial;color-scheme:'+ (mode==='dark'?'dark':'light')+';--layout-color-2:'+(mode==='dark'?'#bfc5bf':'#535e56')+';--layout-background-2:'+(mode==='dark'?'#303830':'#edf1e9')+';--thread-pane-container-gap:3px;}'+nativeCSS+(mode==='milk'?milk.toString():'')+
      '#threadTree{width:460px}table{width:100%;table-layout:fixed}tr,td{height:7.47rem}.card-container{height:7.2rem}button{font:inherit}'+css+'</style><div id=threadTree rows=thread-card><table><tbody><tr class="card-layout children" data-properties=unread>'+template+'</tr></tbody></table></div><script>'+tagScript+'\n'+script+'\n('+exercise.toString()+')();</script>';
    const results=await browser(html,extra);
    results.forEach(r=>console.log((r.pass?'PASS ':'FAIL ')+mode+' '+r.name+(r.pass?'':' '+JSON.stringify(r.detail))));
    if(!results.length||results.some(r=>!r.pass)) process.exitCode=1;
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
