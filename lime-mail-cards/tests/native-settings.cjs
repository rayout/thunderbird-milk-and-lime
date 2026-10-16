const assert = require('node:assert/strict');
const connect = require('./marionette.cjs');
async function exercise() {
  const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
  const tabmail = document.getElementById('tabmail');
  tabmail.switchToTab(0);
  const pane = tabmail.currentAbout3Pane;
  const addon = await AddonManager.getAddonByID('{cc82279d-63ff-4802-841b-5026940f9ed8}');
  const height = () => pane.customElements.get('thread-card').ROW_HEIGHT;
  const nativeHeight = height();
  const wait = async fn => {
    const deadline = Date.now() + 4000;
    while (!await fn()) { if (Date.now() > deadline) throw Error('Settings condition timed out: ' + fn); await new Promise(r => setTimeout(r, 30)); }
  };
  let tab;
  const run = script => tab.browser.browsingContext.currentWindowGlobal.getActor('MarionetteCommands')
    .executeScript(script, [], {newSandbox:false, timeout:3000});
  const open = async () => {
    tab = tabmail.openTab('contentTab', {url:addon.optionsURL, background:true});
    await wait(() => tab.browser.currentURI.spec === addon.optionsURL);
    await wait(() => run("return document.getElementById('separateTags')?.disabled === false;"));
    return run("return document.getElementById('separateTags').checked;");
  };
  const results = [];
  try {
    let checked = await open();
    results.push({name:'default setting is off', pass:!checked});
    await run("document.getElementById('separateTags').click();");
    await wait(() => pane.threadTree.hasAttribute('data-lmc-four-lines') && height() > nativeHeight);
    results.push({name:'option enables four lines in existing mail tab', pass:true});
    tabmail.closeTab(tab);
    checked = await open();
    results.push({name:'saved option survives reopening settings', pass:checked});
    await run("document.getElementById('separateTags').click();");
    await wait(() => !pane.threadTree.hasAttribute('data-lmc-four-lines') && height() === nativeHeight);
    results.push({name:'option restores native height without restart', pass:true});
    await addon.disable();
    await addon.enable();
    await wait(() => pane.document.querySelector('.lmc-card'));
    results.push({name:'saved three-line layout survives addon restart', pass:!pane.threadTree.hasAttribute('data-lmc-four-lines') && height() === nativeHeight});
  } finally {
    if (tab && tabmail.tabInfo.includes(tab)) tabmail.closeTab(tab);
  }
  return results;
}
(async () => {
  const c = await connect(28287, process.env.THUNDERBIRD_TEST_PROFILE);
  try {
    const {value} = await c.executeAsync('const done=arguments[arguments.length-1];(' + exercise.toString() + ')().then(done,e=>done({error:String(e),stack:e.stack}));');
    console.log(JSON.stringify(value, null, 2));
    assert(!value.error, value.error);
    assert(value.every(result => result.pass));
  } finally { await c.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
