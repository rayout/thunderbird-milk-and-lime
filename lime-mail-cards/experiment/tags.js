/* SPDX-License-Identifier: MPL-2.0 */
var LimeTags = (() => {
  let nextId = 0;

  function create(win, { tagService, label, removeLabel = "Remove tag", removeThreadLabel = removeLabel, headersForRow }) {
    const doc = win.document;
    const entries = new Map();
    let active = null;
    let disposed = false;
    const identity = header => header?.folder ? {
      folder: header.folder, uri: header.folder.URI,
      key: header.messageKey, messageId: header.messageId,
    } : null;
    const matches = (header, target) => target && header?.folder?.URI === target.uri &&
      header.messageKey === target.key && header.messageId === target.messageId;
    const report = () => win.console?.error("Lime Mail Cards: unable to update message tags");

    function headerFor(row) {
      const view = win.gDBView;
      if (!view || !Number.isInteger(row.index) || row.index < 0 || row.index >= view.rowCount) return null;
      return view.getMsgHdrAt(row.index);
    }

    function isolate(button) {
      for (const type of ["mousedown", "mouseup", "dblclick", "auxclick", "contextmenu", "keydown", "keypress", "keyup"]) {
        button.addEventListener(type, event => event.stopPropagation());
      }
      button.addEventListener("dragstart", event => { event.preventDefault(); event.stopPropagation(); });
    }

    function removeTag(row, entry, key) {
      try {
        if (disposed || entries.get(row) !== entry || !matches(headerFor(row), entry.target) || !tagService.isValidKey(key)) return;
        const headers = headersForRow ? headersForRow(row) : [headerFor(row)];
        const groups = new Map();
        for (const header of headers) {
          const target = identity(header);
          if (!target) return;
          const current = target.folder.GetMessageHeader(target.key);
          if (!matches(current, target)) return;
          if (!current.getStringProperty("keywords").split(" ").includes(key)) continue;
          if (!groups.has(current.folder)) groups.set(current.folder, new Map());
          groups.get(current.folder).set(current.messageKey, current);
        }
        for (const [folder, messages] of groups) folder.removeKeywordsFromMessages([...messages.values()], key);
      } catch { report(); }
      finally { win.dispatchEvent(new win.Event("lmc-tags-changed")); }
    }

    function describe(row, entry, include) {
      const ids = (row.getAttribute("aria-describedby") || "").split(/\s+/u)
        .filter(id => id && id !== entry.tags.id);
      if (include) ids.push(entry.tags.id);
      const value = ids.join(" ");
      if (value) {
        if (row.getAttribute("aria-describedby") !== value) row.setAttribute("aria-describedby", value);
      } else if (row.hasAttribute("aria-describedby")) row.removeAttribute("aria-describedby");
    }

    function close(restoreFocus = true) {
      if (!active) return;
      const { popup, entry, row, target } = active;
      active = null;
      entry.button.setAttribute("aria-expanded", "false");
      entry.button.removeAttribute("aria-controls");
      try { popup.hidePopup(); } catch {}
      popup.remove();
      try {
        if (restoreFocus && !disposed && entry.button.isConnected && matches(headerFor(row), target)) {
          entry.button.focus();
        }
      } catch {}
    }

    function open(row, entry, event) {
      if (disposed || entries.get(row) !== entry) return;
      close(false);
      try {
        const header = headerFor(row);
        if (!matches(header, entry.target)) return;
        const target = identity(header);
        const keys = header.getStringProperty("keywords").split(" ");
        const popup = doc.createXULElement("menupopup");
        popup.classList.add("gutter-popup", "lmc-tag-popup");
        popup.id = "lmc-tag-popup-" + ++nextId;
        active = { popup, entry, row, target };
        const opened = active;
        for (const tag of tagService.getAllTags()) {
          if (tag.ordinal.includes("~AUTOTAG") && !keys.includes(tag.key)) continue;
          const item = doc.createXULElement("menuitem");
          item.setAttribute("label", tag.tag);
          item.setAttribute("type", "checkbox");
          if (keys.includes(tag.key)) item.setAttribute("checked", "true");
          if (tag.color) item.style.color = tag.color;
          item.addEventListener("command", () => {
            if (disposed || active !== opened) return;
            try {
              const current = target.folder.GetMessageHeader(target.key);
              if (matches(current, target) && tagService.isValidKey(tag.key)) {
                const assigned = current.getStringProperty("keywords").split(" ").includes(tag.key);
                if (assigned) current.folder.removeKeywordsFromMessages([current], tag.key);
                else current.folder.addKeywordsToMessages([current], tag.key);
              }
            } catch { report(); }
            close();
          });
          popup.append(item);
        }
        popup.addEventListener("popuphidden", () => {
          if (active === opened) close();
        });
        (doc.querySelector("popupset") || doc.documentElement).append(popup);
        entry.button.setAttribute("aria-expanded", "true");
        entry.button.setAttribute("aria-controls", popup.id);
        popup.openPopup(entry.button, { position: "after_start", triggerEvent: event });
      } catch {
        close();
        report();
      }
    }

    function render(row, headers) {
      if (disposed) return;
      const content = row.querySelector(".thread-card-column:not(.read-status-column)");
      const native = row.querySelector("thread-card-tags");
      const icons = row.querySelector(".thread-card-icon-info");
      if (!content || !native || !icons) return remove(row);
      try {
        const header = headerFor(row);
        if (!header?.folder) return remove(row);
        let entry = entries.get(row);
        if (entry && (!row.contains(entry.tags) || !row.contains(entry.button))) {
          remove(row);
          entry = null;
        }
        if (!entry) {
          const tags = doc.createElement("span");
          tags.className = "lmc-tags";
          tags.id = "lmc-tags-" + ++nextId;
          const button = doc.createElement("button");
          button.className = "lmc-tag-button";
          button.type = "button";
          button.tabIndex = 0;
          button.title = label;
          button.setAttribute("aria-label", label);
          button.setAttribute("aria-haspopup", "menu");
          button.setAttribute("aria-expanded", "false");
          entry = { tags, button, signature: null, target: null };
          entries.set(row, entry);
          button.addEventListener("click", event => {
            event.stopPropagation();
            if (event.button === 0) open(row, entry, event);
          });
          isolate(button);
          content.append(tags);
          icons.insertBefore(button, icons.querySelector(".button-star"));
        }
        if (active?.entry === entry && !matches(header, active.target)) close(false);
        entry.target = identity(header);
        const keys = new Set(headers
          ? headers.flatMap(item => item.getStringProperty("keywords").split(" "))
          : (native.getAttribute("tags") || "").split(" "));
        const tags = tagService.getAllTags().filter(tag => keys.has(tag.key) && tagService.isValidKey(tag.key));
        const removalLabel = headers?.length > 1 ? removeThreadLabel : removeLabel;
        const signature = JSON.stringify([removalLabel, tags.map(tag => [tag.key, tag.tag, tag.color])]);
        if (signature !== entry.signature) {
          entry.tags.replaceChildren();
          entry.tags.title = tags.map(tag => tag.tag).join(", ");
          entry.tags.setAttribute("aria-label", entry.tags.title);
          entry.tags.hidden = !tags.length;
          for (const tag of tags.slice(0, 2)) {
            const pill = doc.createElement("span");
            pill.className = "lmc-tag";
            const name = doc.createElement("span");
            name.className = "lmc-tag-name";
            name.textContent = tag.tag;
            const remove = doc.createElement("button");
            remove.className = "lmc-tag-remove";
            remove.type = "button";
            remove.title = removalLabel + ": " + tag.tag;
            remove.setAttribute("aria-label", remove.title);
            remove.addEventListener("click", event => {
              event.stopPropagation();
              if (event.button === 0 && row.contains(pill)) {
                entry.button.focus({ preventScroll: true });
                removeTag(row, entry, tag.key);
              }
            });
            isolate(remove);
            pill.append(name, remove);
            pill.title = tag.tag;
            pill.style.setProperty("--lmc-tag-background", `var(--tag-${win.CSS.escape(tag.key)}-backcolor, ButtonFace)`);
            pill.style.setProperty("--lmc-tag-foreground", `var(--tag-${win.CSS.escape(tag.key)}-forecolor, ButtonText)`);
            entry.tags.append(pill);
          }
          if (tags.length > 2) {
            const more = doc.createElement("span");
            more.className = "lmc-tag lmc-tag-more";
            more.textContent = "+" + (tags.length - 2);
            more.title = entry.tags.title;
            entry.tags.append(more);
          }
          entry.signature = signature;
        }
        if (row.classList.contains("lmc-has-tags") !== Boolean(tags.length)) {
          row.classList.toggle("lmc-has-tags", Boolean(tags.length));
        }
        describe(row, entry, tags.length > 0);
      } catch { remove(row); }
    }

    function remove(row) {
      const entry = entries.get(row);
      if (!entry) return;
      if (active?.entry === entry) close(false);
      describe(row, entry, false);
      entry.tags.remove();
      entry.button.remove();
      row.classList.remove("lmc-has-tags");
      entries.delete(row);
    }

    function dispose() {
      disposed = true;
      close(false);
      for (const row of entries.keys()) remove(row);
    }

    return { render, remove, dispose };
  }

  return { create };
})();
