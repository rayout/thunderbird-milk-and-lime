/* SPDX-License-Identifier: MPL-2.0 */
const checkbox = document.getElementById("separateTags");
const status = document.getElementById("status");
const online = document.getElementById("onlineAvatars");
const form = document.getElementById("avatarForm");
const rulesList = document.getElementById("avatarRules");
const cacheButton = document.getElementById("clearAvatarCache");
const nicknameForm = document.getElementById("nicknameForm");
const nicknameSenders = document.getElementById("nicknameSenders");
const text = key => messenger.i18n.getMessage(key);
let rules = {};
function showRules() {
  rulesList.replaceChildren();
  for (const [key, image] of Object.entries(rules).sort(([a], [b]) => a.localeCompare(b))) {
    const row = document.createElement('tr');
    const pictureCell = row.insertCell(), nameCell = row.insertCell(), actionCell = row.insertCell();
    if (LimeAvatars.imageData(image)) {
      const picture = document.createElement('img'); picture.src = image; picture.alt = '';
      pictureCell.append(picture);
    }
    nameCell.textContent = key;
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = text('removeAvatar');
    button.setAttribute('aria-label', text('removeAvatar') + ': ' + key);
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const saved = await messenger.storage.local.get({avatarRules:{}});
        delete saved.avatarRules[key];
        await messenger.storage.local.set({avatarRules:saved.avatarRules});
        rules = saved.avatarRules; showRules(); status.textContent = text('settingSaved');
      } catch { status.textContent = text('settingError'); button.disabled = false; }
    });
    actionCell.append(button); rulesList.append(row);
  }
  document.getElementById('noAvatarRules').hidden = Object.keys(rules).length > 0;
}
for (const element of document.querySelectorAll("[data-i18n]")) {
  element.textContent = messenger.i18n.getMessage(element.dataset.i18n);
}
document.documentElement.lang = messenger.i18n.getUILanguage();
async function load() {
  const settings = await messenger.storage.local.get({ separateTags: false, onlineAvatars: false, avatarRules: {}, nicknameSenders: [] });
  checkbox.checked = settings.separateTags === true;
  online.checked = settings.onlineAvatars === true;
  rules = settings.avatarRules; showRules();
  online.disabled = false; cacheButton.disabled = false;
  for (const control of form.elements) control.disabled = false;
  nicknameSenders.value = settings.nicknameSenders.join('\n');
  for (const control of nicknameForm.elements) control.disabled = false;
  checkbox.disabled = false;
}
checkbox.addEventListener("change", async () => {
  checkbox.disabled = true;
  try {
    await messenger.storage.local.set({ separateTags: checkbox.checked });
    status.textContent = messenger.i18n.getMessage("settingSaved");
  } catch {
    checkbox.checked = !checkbox.checked;
    status.textContent = messenger.i18n.getMessage("settingError");
  } finally { checkbox.disabled = false; }
});
nicknameForm.addEventListener('submit', async event => {
  event.preventDefault();
  const values = nicknameSenders.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  const addresses = values.map(value => LimeAvatars.ruleKey(value));
  if (addresses.length > 100 || addresses.some(address => !address.includes('@') || address.length > 320)) {
    status.textContent = text('invalidNicknameSenders'); return;
  }
  for (const control of nicknameForm.elements) control.disabled = true;
  try {
    const unique = [...new Set(addresses)];
    await messenger.storage.local.set({nicknameSenders: unique});
    nicknameSenders.value = unique.join('\n');
    status.textContent = text('settingSaved');
  } catch { status.textContent = text('settingError'); }
  finally { for (const control of nicknameForm.elements) control.disabled = false; }
});
online.addEventListener('change', async () => {
  online.disabled = true;
  try {
    await messenger.storage.local.set({onlineAvatars:online.checked});
    status.textContent = text('settingSaved');
  } catch { online.checked = !online.checked; status.textContent = text('settingError'); }
  finally { online.disabled = false; }
});
cacheButton.addEventListener('click', async () => {
  cacheButton.disabled = true;
  try {
    await messenger.storage.local.set({avatarCacheReset:Date.now()});
    status.textContent = text('cacheCleared');
  } catch { status.textContent = text('settingError'); }
  finally { cacheButton.disabled = false; }
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  const key = LimeAvatars.ruleKey(document.getElementById('avatarKey').value);
  const file = document.getElementById('avatarFile').files[0];
  if (!key) { status.textContent = text('invalidAvatarAddress'); return; }
  if (!file) { status.textContent = text('invalidAvatarFile'); return; }
  for (const control of form.elements) control.disabled = true;
  try {
    let image;
    try { image = await LimeAvatars.normalize(file, 8 * 1024 * 1024); }
    catch { status.textContent = text('invalidAvatarFile'); return; }
    const saved = await messenger.storage.local.get({avatarRules:{}});
    if (!Object.hasOwn(saved.avatarRules, key) && Object.keys(saved.avatarRules).length >= 100) {
      status.textContent = text('avatarRulesLimit'); return;
    }
    saved.avatarRules[key] = image;
    await messenger.storage.local.set({avatarRules:saved.avatarRules});
    rules = saved.avatarRules; showRules(); form.reset(); status.textContent = text('settingSaved');
  } catch { status.textContent = text('settingError'); }
  finally { for (const control of form.elements) control.disabled = false; }
});
load().catch(() => { status.textContent = messenger.i18n.getMessage("settingError"); });
