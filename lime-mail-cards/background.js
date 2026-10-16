/* SPDX-License-Identifier: MPL-2.0 */
async function start() {
  const settings = await messenger.storage.local.get({ separateTags: false, onlineAvatars: false, avatarRules: {}, avatarCache: {}, avatarCacheVersion: 0 });
  const avatars = LimeAvatars.create({
    contact: address => messenger.LimeCards.getContactPhoto(address),
    cache: settings.avatarCacheVersion === 1 ? settings.avatarCache : {},
    save: avatarCache => messenger.storage.local.set({avatarCache, avatarCacheVersion: 1}),
  });
  avatars.configure(settings);
  const pending = new Map();
  messenger.LimeCards.onAvatarRequest.addListener((address, generation) => {
    const key = generation + ':' + address;
    if (pending.has(key)) return;
    const request = avatars.resolve(address)
      .then(image => messenger.LimeCards.setAvatar(address, image, generation))
      .catch(() => messenger.LimeCards.setAvatar(address, '', generation))
      .catch(() => {})
      .finally(() => pending.delete(key));
    pending.set(key, request);
  });
  await messenger.LimeCards.start({
    missingPreview: messenger.i18n.getMessage("missingPreview"),
    tagLabel: messenger.i18n.getMessage("tagLabel"),
    removeTagLabel: messenger.i18n.getMessage("removeTagLabel"),
    removeThreadTagLabel: messenger.i18n.getMessage("removeThreadTagLabel"),
    separateTags: settings.separateTags === true,
  });
  messenger.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.separateTags) {
      messenger.LimeCards.setSeparateTags(changes.separateTags.newValue === true)
        .catch(() => console.error("Lime Mail Cards: layout update failed"));
    }
    if (area === "local" && (changes.onlineAvatars || changes.avatarRules || changes.avatarCacheReset)) {
      if (changes.onlineAvatars) settings.onlineAvatars = changes.onlineAvatars.newValue === true;
      if (changes.avatarRules) settings.avatarRules = changes.avatarRules.newValue || {};
      avatars.configure(settings);
      const cleared = changes.avatarCacheReset ? avatars.clear() : Promise.resolve();
      cleared.then(() => messenger.LimeCards.resetAvatars())
        .catch(() => console.error('Lime Mail Cards: avatar update failed'));
    }
  });
}
start().catch(() => console.error("Lime Mail Cards: initialization failed"));
