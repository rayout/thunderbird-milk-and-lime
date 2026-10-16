const assert=require('node:assert/strict');
const connect=require('./marionette.cjs');
async function exercise(){
  const {MailServices}=ChromeUtils.importESModule('resource:///modules/MailServices.sys.mjs');
  if(!Array.from(MailServices.accounts.allServers).every(s=>s.type==='none'))throw Error('Local-only profile required');
  const pane=document.getElementById('tabmail').currentAbout3Pane;
  const original=pane.gFolder.URI,index=pane.threadTree.selectedIndex;
  const root=MailServices.accounts.localFoldersServer.rootFolder;
  if(!root.containsChildNamed('Reader matrix'))root.createSubfolder('Reader matrix',null);
  const folder=root.getChildNamed('Reader matrix');
  const longURL='https://example.invalid/'+('long-path-'.repeat(45));
  const html='<html><body style="color:#252b29;background:white;font:16px/1.5 sans-serif"><h2>Reader matrix</h2><p>Short paragraph.</p><blockquote>Quoted message remains readable.</blockquote><table border="1"><tr><th>Document</th><th>Status</th></tr><tr><td>Fixture</td><td style="background:#ee2c2c;color:black">Deadline</td></tr></table><p><a href="'+longURL+'">'+longURL+'</a></p><p>'+('Long body paragraph. '.repeat(120))+'</p><p>End of fixture.</p></body></html>';
  if(!folder.getTotalMessages(false))folder.QueryInterface(Ci.nsIMsgLocalMailFolder).addMessage([
    'From: Matrix Author <matrix@example.invalid>','To: Test User <test@example.invalid>',
    'Subject: Reader matrix - table, quote, long link and attachment',
    'Message-ID: <lime-reader-matrix-v1@example.invalid>','Date: Thu, 15 Oct 2026 14:00:00 +0300',
    'MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="matrix"','','--matrix',
    'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',btoa(html),'--matrix',
    'Content-Type: text/plain; name="notes.txt"','Content-Disposition: attachment; filename="notes.txt"',
    'Content-Transfer-Encoding: base64','',btoa('Synthetic attachment only.'),'--matrix--',''
  ].join('\r\n'));
  try{
    pane.threadTree.selectedIndex=-1;
    pane.displayFolder(folder.URI);
    const {GlodaMsgIndexer}=ChromeUtils.importESModule('resource:///modules/gloda/IndexMsg.sys.mjs');
    GlodaMsgIndexer.indexFolder(folder);
    const wait=async predicate=>{const end=Date.now()+7000;while(!predicate()){if(Date.now()>end)throw Error('Reader fixture timed out');await new Promise(r=>setTimeout(r,50));}};
    await wait(()=>Array.from(folder.messages).every(h=>h.getUint32Property('gloda-id')));
    pane.threadTree.selectedIndex=0;
    const reader=()=>pane.document.getElementById('multiMessageBrowser').contentDocument;
    const body=()=>[...reader().querySelectorAll('iframe')].map(f=>f.contentDocument?.body).find(b=>b?.textContent.includes('End of fixture.'));
    await wait(body);
    const b=body(),win=b.ownerDocument.defaultView;
    const sample=b.ownerDocument.createElement('section');
    sample.innerHTML='<style>.link-fixture a{color:#1068bf}</style><div class="link-fixture"><div class="content"><a id="gitlab-text-link" href="https://example.invalid/issue">Issue</a><a id="gitlab-color-button" href="https://example.invalid/button" style="background:#205d86;color:white">Button</a></div><div class="footer"><a class="mng-notif-link" href="https://example.invalid/notifications">Notifications</a></div></div>';
    b.querySelector('.moz-text-html').append(sample);
    const table=[...b.querySelectorAll('table')].find(t=>t.textContent.includes('Fixture'));
    const quote=b.querySelector('blockquote'),link=b.querySelector('a'),cell=table.querySelector('td:last-child');
    const results=[
      {name:'long HTML body complete',pass:b.textContent.includes('End of fixture.')&&b.getBoundingClientRect().height>500},
      {name:'table and quote retained',pass:table.rows.length===2&&quote.textContent.includes('Quoted message remains readable.'),detail:{table:table.outerHTML,quote:quote.outerHTML}},
      {name:'semantic deadline colors preserved',pass:win.getComputedStyle(cell).backgroundColor==='rgb(238, 44, 44)'&&win.getComputedStyle(cell).color==='rgb(0, 0, 0)',detail:{background:win.getComputedStyle(cell).backgroundColor,color:win.getComputedStyle(cell).color}},
      {name:'long link destination preserved',pass:link.href===longURL},
      {name:'native attachment remains available',pass:reader().body.textContent.includes('notes.txt')},
      {name:'GitLab author stylesheet link is green',pass:win.getComputedStyle(sample.querySelector('#gitlab-text-link')).color==='rgb(69, 101, 34)'},
      {name:'GitLab footer link is green',pass:win.getComputedStyle(sample.querySelector('.mng-notif-link')).color==='rgb(69, 101, 34)'},
      {name:'GitLab explicit button remains readable',pass:win.getComputedStyle(sample.querySelector('#gitlab-color-button')).color==='rgb(255, 255, 255)'},
    ];
    return results;
  }finally{pane.threadTree.selectedIndex=-1;pane.displayFolder(original);pane.threadTree.selectedIndex=index;}
}
(async()=>{const c=await connect(28287,process.env.THUNDERBIRD_TEST_PROFILE);try{
  const result=(await c.executeAsync('const done=arguments[arguments.length-1];('+exercise.toString()+')().then(done,e=>done({error:String(e),stack:e.stack}));')).value;
  console.log(JSON.stringify(result,null,2));assert(!result.error,result.error);assert(result.every(r=>r.pass));
}finally{await c.close();}})().catch(e=>{console.error(e);process.exit(1);});
