/* SPDX-License-Identifier: MPL-2.0 */
var LimeCards = (() => {
  function clean(value) {
    return typeof value === "string"
      ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/gu, " ").trim()
      : "";
  }

  function initials(displayName, address) {
    const displayed = clean(displayName);
    const mailbox = displayed.match(/<([^<>]+)>\s*$/u);
    const name = displayed.replace(/\s*<[^<>]+>\s*$/u, "").replace(/^"(.*)"$/u, "$1")
      .replace(/\s*\(@[^)]*\)\s*$/u, "").trim();
    const label = name || clean(address) || mailbox?.[1] || "";
    const words = label.split(/\s+/u).filter(Boolean);
    const result = words.length > 1
      ? [...words[0]][0] + [...words.at(-1)][0]
      : [...label.split("@")[0]].slice(0, 2).join("");
    return result.toUpperCase() || "?";
  }

  function preview(value, fallback) {
    return [...clean(value)].slice(0, 240).join("") || clean(fallback);
  }

  function localExcerpt(value) {
    if (typeof value !== "string") return "";
    let body = value.slice(0, 16000).replace(/\r\n?/g, "\n").trim();
    const footer = body.search(/^View it on GitLab\./m);
    if (footer >= 0) {
      body = body.slice(0, footer).replace(/\n\s*[—_-]+\s*$/, "").trim();
      // Only discard a known notification preamble when a separate body follows.
      body = body.replace(/^[^:\n]+ (?:commented on a discussion|created an issue|created a merge request):[^\n]*\n\s*\n(?=\S)/u, "");
    }
    return preview(body, "");
  }

  const controllers = new WeakMap();
  let nextDescription = 0;

  function attach(win, { readRow, missingPreview, loadPreviews, getAvatar, tags, settings = {} }) {
    const tree = win.document.getElementById("threadTree");
    if (!tree) return () => {};
    if (controllers.has(tree)) return controllers.get(tree);
    const entries = new Map();
    let disposed = false;
    let frame = null;
    const excerpts = new Map();
    let loading = false;
    let cancelLookup = null;
    let nativeHeight = null;
    let appliedHeight = null;
    const observer = new win.MutationObserver(schedule);
    const observe = () => observer.observe(tree, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ["class", "rows", "data-properties", "id", "aria-label", "tags"],
    });

    function resizeRows(enabled) {
      const card = win.customElements.get("thread-card");
      if (!card || typeof tree.reset !== "function") return;
      if (enabled) {
        if (card.ROW_HEIGHT === appliedHeight) return;
        nativeHeight = card.ROW_HEIGHT;
        appliedHeight = Math.ceil(nativeHeight * 4 / 3);
        card.ROW_HEIGHT = appliedHeight;
      } else {
        const restore = appliedHeight !== null && card.ROW_HEIGHT === appliedHeight;
        appliedHeight = null;
        if (!restore) return;
        card.ROW_HEIGHT = nativeHeight;
      }
      // Virtual spacers and rendered rows must use the same fixed height.
      tree.reset();
    }

    function remove(row) {
      const entry = entries.get(row);
      if (!entry) return;
      let data;
      if (entry.summary) {
        try { data = readRow(row); } catch {}
        restoreSummary(row, entry, data);
      }
      tags?.remove(row);
      entry.avatar.remove();
      entry.excerpt.remove();
      row.classList.remove("lmc-card", "lmc-has-preview");
      const descriptions = (row.getAttribute("aria-describedby") || "").split(/\s+/u)
        .filter(id => id && id !== entry.excerpt.id);
      if (descriptions.length) row.setAttribute("aria-describedby", descriptions.join(" "));
      else row.removeAttribute("aria-describedby");
      entries.delete(row);
    }

    function restoreSummary(row, entry, data) {
      const summary = entry.summary;
      if (!summary) return;
      for (const field of ["subject", "sender", "date"]) {
        const node = row.querySelector("." + field);
        if (!node) continue;
        if (node.textContent === summary.values[field]) {
          node.textContent = data?.nativeSummary?.[field] ?? summary.native[field];
        }
        if (field !== "date" && node.getAttribute("title") === summary.values[field]) {
          const title = data?.nativeSummary?.[field] ?? summary.titles[field];
          if (title === null) node.removeAttribute("title");
          else node.setAttribute("title", title);
        }
      }
      if ((!data || data.rowKey === summary.rowKey) && row.getAttribute("aria-label") === summary.label) {
        if (summary.nativeLabel === null) row.removeAttribute("aria-label");
        else row.setAttribute("aria-label", summary.nativeLabel);
      }
      entry.summary = null;
    }

    function renderSummary(row, entry, data) {
      if (!data.summary) return restoreSummary(row, entry, data);
      if (entry.summary?.rowKey !== data.rowKey) restoreSummary(row, entry, data);
      const previous = entry.summary;
      const values = data.summary;
      const titles = {};
      for (const field of ["subject", "sender", "date"]) {
        const node = row.querySelector("." + field);
        if (!node) continue;
        if (field !== "date") {
          titles[field] = previous && node.getAttribute("title") === previous.values[field]
            ? previous.titles[field] : node.getAttribute("title");
          node.setAttribute("title", values[field]);
        }
        node.textContent = values[field];
      }
      const currentLabel = row.getAttribute("aria-label");
      const nativeLabel = previous && currentLabel === previous.label ? previous.nativeLabel : currentLabel;
      const label = [values.sender, values.date, values.subject].filter(Boolean).join(", ");
      row.setAttribute("aria-label", label);
      entry.summary = { rowKey: data.rowKey, values, native: data.nativeSummary, titles, nativeLabel, label };
    }

    function render() {
      frame = null;
      if (disposed) return;
      observer.disconnect();
      try {
        const enabled = tree.getAttribute("rows") === "thread-card" && !tree.classList.contains("cards-row-compact");
        const separateTags = settings.separateTags === true;
        resizeRows(enabled && separateTags);
        tree.toggleAttribute("data-lmc-four-lines", enabled && separateTags);
        const rows = enabled ? [...tree.querySelectorAll("tr.card-layout")] : [];
        const active = new Set();
        const missing = new Map();
        for (const row of rows) {
          if ((row.dataset.properties || "").split(" ").includes("dummy")) continue;
          const container = row.querySelector(".card-container");
          const content = row.querySelector(".thread-card-column:not(.read-status-column)");
          if (!container || !content || !row.querySelector(".sender") || !row.querySelector(".subject")) continue;
          let data;
          try { data = readRow(row); } catch { data = null; }
          if (!data || typeof data.key !== "string" || !data.key) continue;
          active.add(row);
          let entry = entries.get(row);
          // Native redraws can replace children while keeping the same row object.
          if (entry && (!row.contains(entry.avatar) || !row.contains(entry.excerpt))) {
            remove(row);
            entry = null;
          }
          if (!entry) {
            const avatar = win.document.createElement("span");
            avatar.className = "lmc-avatar";
            avatar.setAttribute("aria-hidden", "true");
            const excerpt = win.document.createElement("span");
            excerpt.className = "lmc-preview";
            excerpt.id = "lmc-preview-" + ++nextDescription;
            container.insertBefore(avatar, content);
            content.append(excerpt);
            entry = { avatar, excerpt };
            entries.set(row, entry);
          }
          renderSummary(row, entry, data);
          const letters = initials(data.displayName, data.address);
          const image = getAvatar?.(data.address) || "";
          const avatarKey = data.address + "#" + image + "#" + letters;
          if (entry.avatarKey !== avatarKey) {
            entry.avatarKey = avatarKey;
            entry.avatar.textContent = letters;
            if (/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image)) {
              const picture = win.document.createElement("img");
              picture.alt = "";
              picture.addEventListener("error", () => {
                if (entry.avatarKey === avatarKey) entry.avatar.textContent = letters;
              }, {once: true});
              picture.src = image;
              entry.avatar.replaceChildren(picture);
            }
          }
          tags?.render(row, data.headers);
          const previewKey = data.key + "#" + data.messageId + "#" + data.previewId;
          const text = clean(data.preview) ? localExcerpt(data.preview) : excerpts.get(previewKey) || "";
          if (!clean(data.preview) && loadPreviews && data.previewId >= 32 && !excerpts.has(previewKey)) {
            missing.set(previewKey, data);
          }
          entry.excerpt.textContent = preview(text, missingPreview);
          entry.excerpt.hidden = !text || (!separateTags && row.classList.contains("lmc-has-tags"));
          row.classList.toggle("lmc-has-preview", !entry.excerpt.hidden);
          const descriptions = new Set((row.getAttribute("aria-describedby") || "").split(/\s+/u).filter(Boolean));
          if (entry.excerpt.hidden) descriptions.delete(entry.excerpt.id);
          else descriptions.add(entry.excerpt.id);
          if (descriptions.size) row.setAttribute("aria-describedby", [...descriptions].join(" "));
          else row.removeAttribute("aria-describedby");
          row.classList.add("lmc-card");
        }
        for (const row of entries.keys()) {
          if (!active.has(row)) remove(row);
        }
        tree.toggleAttribute("data-lmc-active", entries.size > 0);
        if (!loading && missing.size) {
          loading = true;
          cancelLookup = loadPreviews([...missing.values()], results => {
            if (disposed) return;
            for (const key of missing.keys()) excerpts.set(key, localExcerpt(results.get(key)));
            while (excerpts.size > 512) excerpts.delete(excerpts.keys().next().value);
            loading = false;
            cancelLookup = null;
            schedule();
          });
        }
      } finally {
        if (!disposed) observe();
      }
    }

    function schedule() {
      if (!disposed && frame === null) frame = win.requestAnimationFrame(render);
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      if (frame !== null) win.cancelAnimationFrame(frame);
      cancelLookup?.();
      excerpts.clear();
      win.removeEventListener("lmc-tags-changed", schedule);
      win.removeEventListener("lmc-layout-changed", schedule);
      win.removeEventListener("lmc-avatars-changed", schedule);
      win.removeEventListener("uidensitychange", schedule);
      win.removeEventListener("uifontsizechange", schedule);
      for (const row of entries.keys()) remove(row);
      tags?.dispose();
      tree.removeAttribute("data-lmc-active");
      tree.removeAttribute("data-lmc-four-lines");
      resizeRows(false);
      controllers.delete(tree);
    }

    controllers.set(tree, dispose);
    win.addEventListener("lmc-tags-changed", schedule);
    win.addEventListener("lmc-layout-changed", schedule);
    win.addEventListener("lmc-avatars-changed", schedule);
    win.addEventListener("uidensitychange", schedule);
    win.addEventListener("uifontsizechange", schedule);
    observe();
    schedule();
    return dispose;
  }

  return { initials, preview, localExcerpt, attach };
})();
