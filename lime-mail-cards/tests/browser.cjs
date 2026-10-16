const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

module.exports = function browser(html, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lime-cards-browser-'));
    let child, timer;
    const server = http.createServer((req, res) => {
      if (req.url === '/result' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          res.end('ok');
          try { finish(null, JSON.parse(body)); } catch (error) { finish(error); }
        });
      } else {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      }
    });
    function finish(error, result) {
      clearTimeout(timer);
      child?.kill();
      server.close();
      error ? reject(error) : resolve(result);
    }
    server.listen(0, '127.0.0.1', () => {
      child = spawn(process.env.CHROME_BIN || '/opt/google/chrome/chrome', [
        '--headless', '--no-sandbox', '--disable-gpu', '--no-first-run',
        '--disable-background-networking', '--disable-background-timer-throttling',
        '--user-data-dir=' + profile, ...extraArgs,
        'http://127.0.0.1:' + server.address().port,
      ], {stdio: 'ignore'});
      child.on('error', finish);
      timer = setTimeout(() => finish(new Error('Browser test timed out')), 15000);
    });
  });
};
