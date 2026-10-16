const connect = require('./marionette.cjs');
const profile=process.env.THUNDERBIRD_TEST_PROFILE;
(async()=>{
  const c=await connect(28287,profile);
  try {
    console.log(JSON.stringify(await c.executeAsync(`
      const done=arguments[arguments.length-1];
      (async()=>{
        Services.io.offline=true;
        const {MailServices}=ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
        if(!Array.from(MailServices.accounts.allServers).some(s=>s.type==="none")) MailServices.accounts.createLocalMailAccount();
        const root=MailServices.accounts.localFoldersServer.rootFolder;
        if(!root.containsChildNamed("Lime Test")) root.createSubfolder("Lime Test",null);
        const folder=root.getChildNamed("Lime Test");
        if(folder.getTotalMessages(false)===0){
          const local=folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
          for(let i=0;i<40;i++){
            local.addMessage("From - Thu Oct 15 12:00:00 2026\\nFrom: Alice Brown <alice@example.invalid>\\nTo: Bob Smith <bob@example.invalid>\\nSubject: Test message "+i+"\\nMessage-ID: <lime-"+i+"@example.invalid>\\nDate: Thu, 15 Oct 2026 12:"+String(i).padStart(2,"0")+":00 +0000\\nMIME-Version: 1.0\\nContent-Type: text/plain; charset=UTF-8\\n\\nSynthetic local content "+i+".\\n");
          }
        }
        const pane=document.getElementById("tabmail").currentAbout3Pane;
        pane.displayFolder(folder.URI);
        return {folder:folder.URI,count:folder.getTotalMessages(false),pane:pane.document.documentURI};
      })().then(done,e=>done({error:String(e),stack:e.stack}));
    `)));
    console.log(JSON.stringify(await c.executeAsync(`
      const done=arguments[arguments.length-1];
      (async()=>{
        const {AddonManager}=ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
        const file=Services.dirsvc.get("ProfD",Ci.nsIFile);
        file.append("addon-source");
        const addon=await AddonManager.installTemporaryAddon(file);
        return {id:addon.id,active:addon.isActive};
      })().then(done,e=>done({error:String(e),stack:e.stack}));
    `)));
    console.log(JSON.stringify(await c.execute(`
      const p=document.getElementById("tabmail").currentAbout3Pane;
      return {count:p.gDBView?.rowCount,rows:p.document.querySelectorAll("tr.card-layout").length,
        avatars:p.document.querySelectorAll(".lmc-avatar").length,
        tags:[...p.document.querySelectorAll(".lmc-avatar")].slice(0,2).map(e=>({text:e.textContent,namespace:e.namespaceURI,width:e.getBoundingClientRect().width})),
        errors:Services.console.getMessageArray().filter(m=>/lime|LimeCards|experiment\\/api|cards.js/.test(m.message)).map(m=>m.message).slice(-8)};
    `)));
  }finally{await c.close();}
})().catch(e=>{console.error(e);process.exit(1);});
