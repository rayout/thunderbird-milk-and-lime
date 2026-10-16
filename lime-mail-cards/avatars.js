/* SPDX-License-Identifier: MPL-2.0 */
var LimeAvatars = (() => {
  const MAX_IMAGE = 262144;
  const providers = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com', 'me.com', 'mail.ru', 'inbox.ru', 'list.ru', 'bk.ru', 'yandex.ru', 'ya.ru', 'yandex.com', 'proton.me', 'protonmail.com']);
  function domainKey(value) {
    if (typeof value !== 'string' || !/^[\p{L}\p{N}.-]+$/u.test(value)) return '';
    let host;
    try { host = new URL('https://' + value).hostname; } catch { return ''; }
    if (host.length > 253 || /^[\d.]+$/.test(host)) return '';
    return host.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)) ? host : '';
  }
  function ruleKey(value) {
    if (typeof value !== 'string') return '';
    value = value.trim().toLowerCase();
    const parts = value.split('@');
    if (parts.length === 1) return domainKey(value);
    if (parts.length !== 2 || !parts[0] || /[\s<>\x00-\x1f]/.test(parts[0])) return '';
    const domain = domainKey(parts[1]);
    return domain ? parts[0] + '@' + domain : '';
  }
  function imageData(value) {
    return typeof value === 'string' && value.length <= 48000 && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value);
  }
  async function normalize(blob, maxBytes = MAX_IMAGE, logo = false) {
    if (!blob || blob.size > maxBytes || !/^image\/(png|jpeg|gif|webp|x-icon|vnd.microsoft.icon)$/i.test(blob.type)) throw Error('Unsupported image');
    const bitmap = await createImageBitmap(blob);
    try {
      if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 16000000) throw Error('Image too large');
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const context = canvas.getContext('2d');
      context.imageSmoothingQuality = 'high';
      if (logo) {
        // The canvas has two pixels per CSS pixel; small favicons retain their natural display size.
        const scale = Math.min(2, 48 / Math.max(bitmap.width, bitmap.height));
        const width = bitmap.width * scale, height = bitmap.height * scale;
        context.drawImage(bitmap, (64 - width) / 2, (64 - height) / 2, width, height);
      } else {
        const size = Math.min(bitmap.width, bitmap.height);
        context.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size, 0, 0, 64, 64);
      }
      const result = canvas.toDataURL('image/png');
      if (!imageData(result)) throw Error('Image too large');
      return result;
    } finally { bitmap.close(); }
  }
  async function readImage(response) {
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_IMAGE) throw Error('Image unavailable');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_IMAGE) throw Error('Image too large');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return new Blob(chunks, {type: response.headers.get('content-type')?.split(';')[0] || ''});
  }
  function create({contact, normalize: toImage = normalize, fetch: request = fetch, save, cache = {}, now = Date.now}) {
    let settings = {}, generation = 0, timer = null, writing = Promise.resolve();
    const entries = new Map(Object.entries(cache || {}).filter(([domain, entry]) => domainKey(domain) === domain && entry?.expires > now() && entry.expires <= now() + 8 * 86400000 && (entry.image === '' || imageData(entry.image))).slice(-128));
    const pending = new Map(), controllers = new Set(), queue = [];
    let active = 0;
    function flush() {
      clearTimeout(timer); timer = null;
      const snapshot = Object.fromEntries(entries);
      writing = writing.catch(() => {}).then(() => save(snapshot));
      return writing;
    }
    function remember(domain, image) {
      entries.delete(domain);
      entries.set(domain, {image, expires: now() + (image ? 7 * 86400000 : 86400000)});
      while (entries.size > 128) entries.delete(entries.keys().next().value);
      clearTimeout(timer);
      timer = setTimeout(() => flush().catch(() => console.error('Lime Mail Cards: avatar cache save failed')), 300);
    }
    function drain() {
      while (active < 2 && queue.length) {
        const job = queue.shift();
        active++;
        job.run().then(job.resolve, () => job.resolve('')).finally(() => { active--; drain(); });
      }
    }
    function online(domain) {
      const cached = entries.get(domain);
      if (cached?.expires > now()) return Promise.resolve(cached.image);
      if (pending.has(domain)) return pending.get(domain);
      if (queue.length >= 128) return Promise.resolve('');
      const revision = generation;
      const result = new Promise(resolve => {
        queue.push({resolve, run: async () => {
          if (revision !== generation || !settings.onlineAvatars) return '';
          const controller = new AbortController();
          controllers.add(controller);
          const timeout = setTimeout(() => controller.abort(), 5000);
          let image = '';
          try {
            // shortcut: DDG's domain icon endpoint has no SLA; keep initials on failure.
            const response = await request('https://icons.duckduckgo.com/ip3/' + domain + '.ico', {
              credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: controller.signal,
            });
            image = await toImage(await readImage(response), MAX_IMAGE, true);
            if (!imageData(image)) image = '';
          } catch {} finally { clearTimeout(timeout); controllers.delete(controller); }
          if (revision !== generation) return '';
          remember(domain, image);
          return image;
        }});
        drain();
      });
      pending.set(domain, result);
      result.finally(() => { if (pending.get(domain) === result) pending.delete(domain); });
      return result;
    }
    return {
      configure(value) {
        settings = value; generation++;
        for (const controller of controllers) controller.abort();
        for (const job of queue.splice(0)) job.resolve('');
        pending.clear();
      },
      async resolve(value) {
        const address = ruleKey(value);
        if (!address.includes('@')) return '';
        const revision = generation;
        try {
          const photo = await contact(address);
          if (photo && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*$/.test(photo) && photo.length <= 350000) {
            const image = await toImage(await (await fetch(photo)).blob());
            if (revision !== generation) return '';
            if (imageData(image)) return image;
          }
        } catch {}
        if (revision !== generation) return '';
        const domain = address.split('@')[1];
        for (const key of [address, domain]) {
          const image = Object.hasOwn(settings.avatarRules || {}, key) ? settings.avatarRules[key] : '';
          if (imageData(image)) return image;
        }
        const publicDomain = domain.includes('.') && !/\.(?:local|localhost|internal|test|invalid|example|onion)$/.test(domain);
        return settings.onlineAvatars === true && publicDomain && !providers.has(domain) ? online(domain) : '';
      },
      async clear() { entries.clear(); await flush(); },
      flush,
    };
  }
  return {create, ruleKey, imageData, normalize};
})();
