const fs = require('node:fs');
const path = require('node:path');
const browser = require('./browser.cjs');
async function exercise() {
  const checks = [];
  const check = (name, pass) => checks.push({name, pass});
  try {
    const source = document.createElement('canvas');
    source.width = 15; source.height = 16;
    source.getContext('2d').fillRect(0, 0, 15, 16);
    const blob = await new Promise(resolve => source.toBlob(resolve));
    const logo = await LimeAvatars.normalize(blob, 262144, true);
    const bitmap = await createImageBitmap(await (await fetch(logo)).blob());
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
    const alpha = (x,y) => ctx.getImageData(x,y,1,1).data[3];
    check('small logo is centered without stretching to avatar edges', alpha(0,0) === 0 && alpha(31,31) === 255 && alpha(8,31) === 0);
    check('rectangular logo keeps both edges and original aspect ratio', alpha(17,16) > 0 && alpha(46,47) > 0 && alpha(16,31) === 0);
    const photo = await LimeAvatars.normalize(blob);
    const p = await createImageBitmap(await (await fetch(photo)).blob());
    ctx.clearRect(0,0,64,64); ctx.drawImage(p,0,0);
    check('contact photos still fill the avatar', alpha(0,0) === 255 && alpha(63,63) === 255);
  } catch(e) { check(String(e), false); }
  await fetch('/result',{method:'POST',body:JSON.stringify(checks)});
}
(async()=>{
  const script = fs.readFileSync(path.join(__dirname,'../avatars.js'),'utf8');
  const results = await browser('<script>'+script+'\n('+exercise.toString()+')();</script>');
  for(const result of results) console.log((result.pass?'PASS ':'FAIL ')+result.name);
  if(!results.length || results.some(r=>!r.pass)) process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
