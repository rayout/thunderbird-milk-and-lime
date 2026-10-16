const assert = require('node:assert/strict');
const connect = require('./marionette.cjs');
async function exercise() {
  const { MailServices } = ChromeUtils.importESModule('resource:///modules/MailServices.sys.mjs');
  if (!Services.io.offline || !Array.from(MailServices.accounts.allServers).every(s => s.type === 'none')) throw Error('Offline local profile required');
  const tabmail = document.getElementById('tabmail');
  tabmail.switchToTab(0);
  const pane = tabmail.currentAbout3Pane;
  const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const addon = await AddonManager.getAddonByID('{cc82279d-63ff-4802-841b-5026940f9ed8}');
  const options = tabmail.openTab('contentTab', {url:addon.optionsURL, background:true});
  const run = script => options.browser.browsingContext.currentWindowGlobal.getActor('MarionetteCommands')
    .executeScript(script, [], {newSandbox:false, timeout:3000});
  const folder = MailServices.accounts.localFoldersServer.rootFolder.getChildNamed('Lime Test');
  pane.displayFolder(folder.URI);
  pane.threadTree.scrollToIndex(0);
  const settle = () => new Promise(resolve => setTimeout(resolve, 200));
  for (let attempt=0; attempt<20; attempt++) {
    await settle();
    if (options.browser.currentURI.spec === addon.optionsURL && await run("return document.getElementById('separateTags')?.disabled === false;")) break;
  }
  const wasSeparate = await run("return document.getElementById('separateTags').checked;");
  if (!wasSeparate) await run("document.getElementById('separateTags').click();");
  await settle();
  const header = pane.gDBView.getMsgHdrAt(0), tag = MailServices.tags.getAllTags()[0];
  const original = header.getStringProperty('keywords'), preview = header.getStringProperty('preview');
  const prefs = ['mail.uifontsize', 'mail.uidensity'].map(key => [key, Services.prefs.prefHasUserValue(key), Services.prefs.getIntPref(key)]);
  const results = [];
  try {
    header.setStringProperty('preview', 'Содержимое письма остаётся видно вместе с меткой.');
    folder.addKeywordsToMessages([header], tag.key);
    for (const font of [15, 18]) for (const density of [0, 1, 2]) {
      Services.prefs.setIntPref('mail.uifontsize', font);
      Services.prefs.setIntPref('mail.uidensity', density);
      await settle();
      const row = pane.threadTree.getRowAtIndex(0);
      const rects = ['.subject', '.lmc-tags', '.lmc-preview', '.sender'].map(s => row.querySelector(s).getBoundingClientRect());
      const bottom = row.getBoundingClientRect().bottom;
      results.push({name: `four visible lines font=${font} density=${density}`, pass: rects.every((r, i) => r.height > 0 && r.bottom <= bottom && (!i || rects[i-1].bottom <= r.top + 1)), rects});
      const height = pane.customElements.get('thread-card').ROW_HEIGHT;
      results.push({name: `virtual height font=${font} density=${density}`, pass: Math.abs(row.getBoundingClientRect().height - height) < 1});
    }
  } finally {
    if (!original.split(' ').includes(tag.key)) folder.removeKeywordsFromMessages([header], tag.key);
    header.setStringProperty('preview', preview);
    for (const [key, hadValue, value] of prefs) {
      if (hadValue) Services.prefs.setIntPref(key, value);
      else Services.prefs.clearUserPref(key);
    }
    await settle();
    if (!wasSeparate) await run("document.getElementById('separateTags').click();");
    tabmail.closeTab(options);
  }
  return results;
}
(async () => {
  const c = await connect(28287, process.env.THUNDERBIRD_TEST_PROFILE);
  try {
    const { value } = await c.executeAsync('const done=arguments[arguments.length-1];(' + exercise.toString() + ')().then(done,e=>done({error:String(e),stack:e.stack}));');
    console.log(JSON.stringify(value, null, 2));
    assert(!value.error, value.error);
    assert(value.every(result => result.pass));
  } finally { await c.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
