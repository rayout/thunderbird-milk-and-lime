const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const browser = require('./browser.cjs');
const file = path.join(__dirname, '../experiment/tags.js');
const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const script = async function () {
  const results = [];
  const check = (name, pass) => results.push({name, pass: Boolean(pass)});
  try {
    check('tag controller exists', typeof window.LimeTags?.create === 'function');
    if (!window.LimeTags?.create) return;
    const row = document.querySelector('tr');
    const nativeTags = row.querySelector('thread-card-tags');
    row.index = 0;
    row.setAttribute('aria-describedby', 'existing');
    const before = row.innerHTML;
    let metadata = [
      {key:'red', tag:'Срочно', color:'#cc0000', ordinal:''},
      {key:'blue', tag:'<img src=x> Проект', color:'#0055ff', ordinal:''},
      {key:'green', tag:'Готово', color:'#008000', ordinal:''},
      {key:'auto', tag:'Auto', color:'', ordinal:'~AUTOTAG'},
    ];
    const tagService = {
      getAllTags: () => metadata,
      isValidKey: key => metadata.some(tag => tag.key === key),
    };
    const operations = [];
    const messages = new Map();
    const folder = {
      URI: 'mailbox://fictitious',
      GetMessageHeader: key => messages.get(key),
      addKeywordsToMessages(headers, key) {
        operations.push({kind:'add', headers, key});
        headers[0].keywords = [...new Set([...headers[0].keywords.split(' '), key])].join(' ').trim();
      },
      removeKeywordsFromMessages(headers, key) {
        operations.push({kind:'remove', headers, key});
        for (const header of headers) header.keywords = header.keywords.split(' ').filter(value => value !== key).join(' ');
      },
    };
    const first = {folder, messageKey:1, messageId:'first', keywords:'red blue green', isRead:false,
      getStringProperty: function () { return this.keywords; }};
    const second = {...first, messageKey:2, messageId:'second', keywords:''};
    messages.set(1, first); messages.set(2, second);
    window.gDBView = {
      rowCount:2, getMsgHdrAt: index => index === 0 ? first : second,
      getSelectedMsgHdrs: () => { throw new Error('Selection must not be used'); },
    };
    document.createXULElement = name => {
      const node = document.createElement(name);
      if (name === 'menupopup') {
        node.openPopup = () => node.dispatchEvent(new Event('popupshown'));
        node.hidePopup = () => node.dispatchEvent(new Event('popuphidden'));
      }
      return node;
    };
    const controller = LimeTags.create(window, {tagService, label:'Метки письма'});
    controller.render(row);
    const button = row.querySelector('.lmc-tag-button');
    let pills = row.querySelector('.lmc-tags');
    check('two named tags and overflow', pills?.textContent === 'Срочно<img src=x> Проект+1');
    check('tag name never becomes HTML', !pills.querySelector('img'));
    check('full list accessible', pills.title.includes('Готово') && row.getAttribute('aria-describedby').includes(pills.id));
    check('all tag names announced despite overflow', pills.getAttribute('aria-label') === 'Срочно, <img src=x> Проект, Готово');
    check('tagged layout state', row.classList.contains('lmc-has-tags'));
    check('icon-only tag action is named and next to native star', button.textContent === '' && button.nextElementSibling?.classList.contains('button-star') && button.title === 'Метки письма' && button.getAttribute('aria-label') === 'Метки письма');
    check('button is keyboard reachable', button.tabIndex === 0 && button.getAttribute('aria-haspopup') === 'menu');
    check('native tag component remains unchanged', nativeTags.getAttribute('tags') === 'red blue green unknown');
    let mutations = 0;
    const observer = new MutationObserver(records => mutations += records.length);
    observer.observe(row, {subtree:true, attributes:true, childList:true, characterData:true});
    controller.render(row); controller.render(row);
    await Promise.resolve();
    check('unchanged rendering does not mutate DOM', mutations === 0);
    observer.disconnect();
    metadata[0] = {...metadata[0], tag:'Важное', color:'#aa0000'};
    controller.render(row);
    check('renamed tag updates without changed key', pills.textContent.startsWith('Важное'));
    let bubbled = 0;
    row.addEventListener('click', () => bubbled++);
    row.addEventListener('keydown', () => bubbled++);
    row.addEventListener('keypress', () => bubbled++);
    button.dispatchEvent(new KeyboardEvent('keydown', {key:' ', bubbles:true}));
    button.dispatchEvent(new KeyboardEvent('keypress', {key:'Enter', bubbles:true}));
    button.click();
    const popup = document.querySelector('menupopup');
    check('button events cannot select or open a message', bubbled === 0);
    check('popup has current checked tags and excludes unassigned autotags', popup?.children.length === 3 && popup.firstElementChild.hasAttribute('checked'));
    check('popup announces expanded state', button.getAttribute('aria-expanded') === 'true');
    row.index = 1;
    popup.firstElementChild.dispatchEvent(new Event('command'));
    check('recycled row command targets original message only', operations.length === 1 && operations[0].headers.length === 1 && operations[0].headers[0] === first && first.keywords === 'blue green' && second.keywords === '');
    check('tagging never marks either message read', !first.isRead && !second.isRead);
    check('command closes and removes popup', !document.querySelector('menupopup') && button.getAttribute('aria-expanded') === 'false');
    button.click();
    check('stale row cannot open menu for a different message before render', !document.querySelector('menupopup'));
    nativeTags.setAttribute('tags', ''); controller.render(row);
    check('untagged message shows only add button', pills.hidden && !row.getAttribute('aria-describedby').includes(pills.id));
    check('untagged row releases preview space', !row.classList.contains('lmc-has-tags'));
    button.click();
    const add = document.querySelector('menupopup').firstElementChild;
    add.dispatchEvent(new Event('command'));
    check('adds one native tag to unselected message', operations.length === 2 && operations[1].kind === 'add' && operations[1].headers[0] === second && second.keywords === 'red');
    check('focus restored on closing the current message popup', document.activeElement === button);
    button.click();
    const missing = document.querySelector('menupopup').firstElementChild;
    messages.delete(2);
    missing.dispatchEvent(new Event('command'));
    check('deleted message cannot be tagged by stale popup', operations.length === 2);
    messages.set(2, {...second, messageId:'replacement'});
    button.click();
    document.querySelector('menupopup').firstElementChild.dispatchEvent(new Event('command'));
    check('reused message key with new message identity rejected', operations.length === 2);
    messages.set(2, second);
    const errors = [];
    const originalError = console.error;
    const originalRemove = folder.removeKeywordsFromMessages;
    console.error = message => errors.push(message);
    folder.removeKeywordsFromMessages = () => { throw new Error('private message contents'); };
    button.click();
    document.querySelector('menupopup').firstElementChild.dispatchEvent(new Event('command'));
    console.error = originalError;
    folder.removeKeywordsFromMessages = originalRemove;
    check('tag write failure is contained and closes popup', operations.length === 2 && !document.querySelector('menupopup'));
    check('failure diagnostic contains no message data', errors.length === 1 && !errors[0].includes('private'));
    button.click();
    const invalid = document.querySelector('menupopup').firstElementChild;
    metadata = metadata.filter(tag => tag.key !== 'red');
    invalid.dispatchEvent(new Event('command'));
    check('deleted tag cannot be applied by stale popup', operations.length === 2);
    button.click();
    const late = document.querySelector('menupopup').firstElementChild;
    controller.dispose(); late.dispatchEvent(new Event('command'));
    check('disabled helper rejects old command', operations.length === 2);
    check('dispose removes popup and added DOM', !document.querySelector('.lmc-tags, .lmc-tag-button, menupopup'));
    check('dispose preserves original aria description', row.getAttribute('aria-describedby') === 'existing');
    check('dispose removes layout state', !row.classList.contains('lmc-has-tags'));
    nativeTags.setAttribute('tags', 'red blue green unknown');
    check('dispose restores original row markup', row.innerHTML === before);
    controller.render(row);
    check('disposed helper cannot recreate UI', !row.querySelector('.lmc-tag-button'));
    row.index = 0;
    first.keywords = 'blue green'; second.keywords = 'blue';
    const removable = LimeTags.create(window, {tagService, label:'Метки письма', removeLabel:'Снять метку', headersForRow: () => [first, second]});
    removable.render(row, [first, second]);
    const crosses = row.querySelectorAll('.lmc-tag-remove');
    check('every named pill has a keyboard reachable remove action', crosses.length === 2 && [...crosses].every(b => b.tagName === 'BUTTON' && b.tabIndex === 0 && b.getAttribute('aria-label').startsWith('Снять метку:')));
    if (crosses.length) {
      const count = operations.length;
      crosses[0].dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}));
      crosses[0].click();
      check('cross removes only its tag from all summary messages', operations.length > count && first.keywords === 'green' && second.keywords === '');
      check('cross does not open or select the message', bubbled === 0 && !first.isRead && !second.isRead);
      const saved = operations.length;
      crosses[0].click();
      check('repeated cross never adds a removed tag', operations.length === saved && first.keywords === 'green');
      row.index = 1;
      crosses[1].click();
      check('cross from a recycled row cannot change either message', operations.length === saved && first.keywords === 'green');
      row.index = 0;
      removable.dispose(); crosses[1].click();
      check('removed cross cannot act after dispose', operations.length === saved);
    } else removable.dispose();
  } catch (error) { check(error.message, false); }
  finally { await fetch('/result', {method:'POST', body:JSON.stringify(results)}); }
};
const html = '<!doctype html><meta charset=utf-8><popupset></popupset><table><tbody><tr><td><div class="thread-card-column"><div class="thread-card-icon-info"><thread-card-tags tags="red blue green unknown"></thread-card-tags><button class="button-star"></button></div></div></td></tr></tbody></table><script>' + source + '\n(' + script.toString() + ')();</script>';
browser(html).then(results => {
  results.forEach(result => console.log((result.pass ? 'PASS ' : 'FAIL ') + result.name));
  assert(results.length && results.every(result => result.pass), 'Tag DOM checks failed');
}).catch(error => { console.error(error.message); process.exitCode = 1; });
