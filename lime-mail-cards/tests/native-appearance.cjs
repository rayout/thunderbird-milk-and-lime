// Run after native-demo.cjs; the connector refuses the working profile.
const assert=require('node:assert/strict');
const connect=require('./marionette.cjs');
function inspect(){
  const results=[];
  const check=(name,pass,detail)=>results.push({name,pass:Boolean(pass),detail});
  const pane=document.getElementById('tabmail').currentAbout3Pane;
  const doc=pane.document;
  const rail=document.getElementById('spacesToolbar');
  const railBox=rail.getBoundingClientRect();
  check('rail matches reference width',Math.abs(railBox.width-56)<1,railBox.width);
  check('rail distinct from folder pane',getComputedStyle(rail).backgroundColor==='rgb(236, 239, 230)'&&getComputedStyle(rail).backgroundColor!==pane.getComputedStyle(doc.getElementById('folderPane')).backgroundColor);
  check('rail does not overlap mail workspace',document.getElementById('messengerBody').getBoundingClientRect().left>=railBox.right-1);
  for(const id of ['mailButton','addressBookButton','calendarButton','tasksButton','chatButton','settingsButton']){
    const button=document.getElementById(id),icon=button.querySelector('img'),b=button.getBoundingClientRect();
    check('reference rail button geometry '+id,Math.abs(b.width-36)<1&&Math.abs(b.height-36)<1&&getComputedStyle(button).borderRadius==='9px',{width:b.width,height:b.height});
    check('reference rail icon rendered '+id,getComputedStyle(icon).content.includes('data:image/svg+xml')&&icon.getBoundingClientRect().width===21&&getComputedStyle(icon).strokeOpacity!=='0');
  }
  check('system UI font matches mockup',getComputedStyle(document.documentElement).fontFamily.startsWith('system-ui')&&pane.getComputedStyle(doc.documentElement).fontFamily.startsWith('system-ui'));
  check('reference font hierarchy',pane.getComputedStyle(doc.querySelector('.lmc-card .subject')).fontSize==='15px'&&pane.getComputedStyle(doc.querySelector('.lmc-card .sender')).fontSize==='12px'&&pane.getComputedStyle(doc.getElementById('threadPaneFolderName')).fontSize==='20px');
  const tagButton=doc.querySelector('.lmc-tag-button'),tagStyle=pane.getComputedStyle(tagButton),tagIcon=pane.getComputedStyle(tagButton,'::before');
  check('outline tag icon replaces plus',tagButton.textContent===''&&tagIcon.maskImage.includes('data:image/svg+xml')&&tagIcon.width==='16px'&&tagStyle.borderTopWidth==='0px',tagIcon.maskImage);
  check('tag action retains accessible label',tagButton.getAttribute('aria-label')&&tagButton.getAttribute('aria-haspopup')==='menu'&&tagButton.tabIndex===0);
  const search=document.querySelector('global-search-bar');
  const input=search?.shadowRoot.querySelector('input');
  check('native search uses rounded field',input&&getComputedStyle(input).borderRadius==='7px');
  check('native compose button rounded',pane.getComputedStyle(doc.getElementById('folderPaneWriteMessage')).borderRadius==='7px');
  const count=doc.getElementById('threadPaneFolderCountContainer');
  check('folder count secondary to title',parseFloat(pane.getComputedStyle(count).fontSize)<parseFloat(pane.getComputedStyle(doc.getElementById('threadPaneFolderName')).fontSize));
  const reader=doc.getElementById('multiMessageBrowser').contentDocument;
  const win=reader.defaultView;
  const heading=reader.querySelector('conversation-header')?.shadowRoot.querySelector('linkified-subject')?.shadowRoot.querySelector('.subject');
  check('conversation heading is 18px',heading&&win.getComputedStyle(heading).fontSize==='18px');
  const headers=[...reader.querySelectorAll('.messageHeader:not(.expanded)')];
  check('collapsed messages present',headers.length>=2,headers.length);
  for(const [i,header] of headers.entries()){
    const author=header.querySelector('.author');
    const a=author.getBoundingClientRect(),s=header.querySelector('.snippet').getBoundingClientRect();
    const avatar=header.querySelector('.contactInitials').getBoundingClientRect();
    const options=header.querySelector('message-header-options').getBoundingClientRect();
    check('compact collapsed header '+i,header.getBoundingClientRect().height<=66,header.getBoundingClientRect().height);
    check('preview below author '+i,s.top>=a.bottom-1&&s.width>20,{author:a.toJSON(),snippet:s.toJSON()});
    check('avatar centered and square '+i,Math.abs(avatar.width-avatar.height)<1&&avatar.right<=a.left+1);
    check('date does not overlap author '+i,options.left>=a.right-1&&options.right<=header.getBoundingClientRect().right+1);
    check('real sender address retained '+i,author.shadowRoot.querySelector('.smallEmail').textContent.includes('@example.invalid'));
  }
  const expanded=reader.querySelector('.messageHeader.expanded');
  check('opened message header separated',expanded&&win.getComputedStyle(expanded).borderBottomWidth==='1px');
  const frames=[...reader.querySelectorAll('.message iframe')].filter(f=>f.contentDocument?.body?.textContent.includes('Подготовила'));
  check('synthetic HTML message rendered',frames.length===1,frames.length);
  if(frames[0]){
    const body=frames[0].contentDocument.body;
    check('original body color preserved',frames[0].contentWindow.getComputedStyle(body).color==='rgb(37, 43, 41)');
    check('fixture has no encoding damage',!body.textContent.includes('\uFFFD'));
    check('original body link preserved',body.querySelector('a')?.getAttribute('href')==='https://example.invalid/discussion');
    const linkStyle=frames[0].contentWindow.getComputedStyle(body.querySelector('a'));
    check('ordinary message link uses readable lime green',linkStyle.color==='rgb(69, 101, 34)'&&linkStyle.textDecorationLine.includes('underline'),{color:linkStyle.color,decoration:linkStyle.textDecorationLine});
  }
  const subject=doc.querySelector('.lmc-card .subject');
  check('native cards active',Boolean(subject));
  check('main window has no horizontal overflow',document.documentElement.scrollWidth<=innerWidth+1,{scroll:document.documentElement.scrollWidth,width:innerWidth});
  check('reader has no horizontal overflow',reader.documentElement.scrollWidth<=win.innerWidth+1,{scroll:reader.documentElement.scrollWidth,width:win.innerWidth});
  const fontSize=reader.documentElement.style.fontSize;
  try{
    reader.documentElement.style.fontSize='15px';
    for(const [i,header] of headers.entries()){
      const a=header.querySelector('.author').getBoundingClientRect(),v=header.querySelector('.contactInitials').getBoundingClientRect();
      check('large text keeps avatar outside author '+i,v.right<=a.left,{avatar:v.toJSON(),author:a.toJSON()});
    }
  }finally{reader.documentElement.style.fontSize=fontSize;}
  return results;
}
(async()=>{
  const c=await connect(28287,process.env.THUNDERBIRD_TEST_PROFILE);
  try{
    const results=[];
    const images=(await c.executeAsync(`
      const done=arguments[arguments.length-1];
      const icons=[...document.querySelectorAll('#spacesToolbar .spaces-toolbar-button > img')].map(el=>getComputedStyle(el).content).filter(url=>url.includes('data:image/svg+xml'));
      const pane=document.getElementById('tabmail').currentAbout3Pane;
      icons.push(pane.getComputedStyle(pane.document.querySelector('.lmc-tag-button'),'::before').maskImage);
      Promise.all(icons.map(async url=>{
        const image=new Image();image.src=url.slice(5,-2);await image.decode();
        const canvas=document.createElementNS('http://www.w3.org/1999/xhtml','canvas');canvas.width=canvas.height=24;
        const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,24,24);
        return ctx.getImageData(0,0,24,24).data.some((v,i)=>i%4===3&&v>0);
      })).then(values=>done(values),error=>done([String(error)]));
    `)).value;
    results.push({name:'all six rail glyphs and tag mask load with visible pixels',pass:images.length===7&&images.every(value=>value===true),detail:images});
    const scaling=(await c.executeAsync(`
      const done=arguments[arguments.length-1];
      (async()=>{
        const {UIFontSize}=ChromeUtils.importESModule('resource:///modules/UIFontSize.sys.mjs');
        const had=Services.prefs.prefHasUserValue('mail.uifontsize'),old=Services.prefs.getIntPref('mail.uifontsize',0);
        const p=document.getElementById('tabmail').currentAbout3Pane;
        const settle=()=>new Promise(r=>setTimeout(r,200));
        try{
          UIFontSize.size=18;await settle();
          const explicit=p.getComputedStyle(p.document.querySelector('.lmc-card .subject')).fontSize;
          UIFontSize.size=0;await settle();
          const before=UIFontSize.size;UIFontSize.increaseSize();await settle();
          return {explicit,increased:p.getComputedStyle(p.document.querySelector('.lmc-card .subject')).fontSize,expected:before+1};
        }finally{
          if(had)Services.prefs.setIntPref('mail.uifontsize',old);else Services.prefs.clearUserPref('mail.uifontsize');
          await settle();
        }
      })().then(done,error=>done({error:String(error)}));
    `)).value;
    results.push({name:'native font controls enlarge cards from explicit and default size',pass:scaling.explicit==='18px'&&scaling.increased===scaling.expected+'px',detail:scaling});
    for(const width of [1600,1100]){
      await c.call('WebDriver:SetWindowRect',{width,height:1000});
      await c.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),300);');
      const current=(await c.execute('return ('+inspect.toString()+')();')).value;
      results.push(...current.map(r=>({...r,name:width+' / '+r.name})));
    }
    console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length,failures:results.filter(r=>!r.pass)},null,2));
    assert(results.every(r=>r.pass),'Native appearance checks failed');
  }finally{
    await c.call('WebDriver:SetWindowRect',{width:1600,height:1000});
    await c.close();
  }
})().catch(e=>{console.error(e);process.exit(1);});
