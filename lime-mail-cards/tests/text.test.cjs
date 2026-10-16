const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scope = {};
const source = path.join(__dirname, '../experiment/cards.js');
if (fs.existsSync(source)) vm.runInNewContext(fs.readFileSync(source, 'utf8'), scope);
const cards = scope.LimeCards || {};

for (const [name, address, expected] of [
  ['Анна Смирнова (@asm)', '', 'АС'],
  ['Alice Brown', '', 'AB'],
  ['Alice Brown <alice@example.invalid>', '', 'AB'],
  ['"Анна Смирнова" <anna@example.invalid>', '', 'АС'],
  ['<alice@example.invalid>', '', 'AL'],
  ['  Анна   Смирнова  ', '', 'АС'],
  ['Alice', '', 'AL'],
  ['', 'alice@example.invalid', 'AL'],
  ['alice@example.invalid', '', 'AL'],
  ['', '', '?'],
  [null, {}, '?'],
  ['𐐀𐐁', '', '𐐀𐐁'],
]) {
  test('initials: ' + JSON.stringify(name), () => {
    assert.equal(typeof cards.initials, 'function');
    assert.equal(cards.initials(name, address), expected);
  });
}
for (const [input, expected] of [
  ['  Первая\n строка  ', 'Первая строка'],
  [null, 'Нет превью'],
  ['', 'Нет превью'],
  [{}, 'Нет превью'],
  ['<img src=x>', '<img src=x>'],
  ['a\u0000b\u202ec', 'a b c'],
]) {
  test('preview: ' + JSON.stringify(input), () => {
    assert.equal(typeof cards.preview, 'function');
    assert.equal(cards.preview(input, 'Нет превью'), expected);
  });
}
test('preview is bounded without splitting supplementary Unicode', () => {
  assert.equal(typeof cards.preview, 'function');
  const text = cards.preview('𐐀'.repeat(300), '');
  assert.equal([...text].length, 240);
  assert.equal(text, '𐐀'.repeat(240));
});
for (const [body, expected] of [
  ['Анна commented on a discussion:\n\nПоправила отступы и проверила мобильную версию.\n\nView it on GitLab.\nYou are receiving this email', 'Поправила отступы и проверила мобильную версию.'],
  ['Анна created an issue: #4\n\nНужно исправить форму входа.\n\nView it on GitLab.', 'Нужно исправить форму входа.'],
  ['Issue was closed by Анна\n\nView it on GitLab.', 'Issue was closed by Анна'],
  ['View it on GitLab.\nYou are receiving this email', ''],
  ['Обычное письмо\nВторая строка', 'Обычное письмо Вторая строка'],
  ['Пример инструкции: commented on a discussion:\nНе удалять\nView it on GitLab.', 'Пример инструкции: commented on a discussion: Не удалять'],
]) test('useful local excerpt: '+body.slice(0,30), () => {
  assert.equal(typeof cards.localExcerpt, 'function');
  assert.equal(cards.localExcerpt(body), expected);
});
