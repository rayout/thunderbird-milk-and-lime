/* SPDX-License-Identifier: MPL-2.0 */
var LimeCards = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    context.callOnClose({ close: () => this.stop() });
    return { LimeCards: {
      start: options => this.start(options),
      setSeparateTags: enabled => this.setSeparateTags(enabled),
      getContactPhoto: (address, nickname) => this.getContactPhoto(address, nickname),
      setNicknameSenders: addresses => this.setNicknameSenders(addresses),
      setAvatar: (address, image, generation) => this.setAvatar(address, image, generation),
      resetAvatars: () => this.resetAvatars(),
      onAvatarRequest: new ExtensionCommon.EventManager({
        context, name: "LimeCards.onAvatarRequest",
        register: fire => {
          this.avatarListeners ??= new Set();
          const listener = (address, generation) => fire.async(address, generation).catch(() => {});
          this.avatarListeners.add(listener);
          return () => this.avatarListeners.delete(listener);
        },
      }).api(),
    } };
  }

  correspondentAddress(header, column) {
    try {
      const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
      const authors = MailServices.headerParser.parseDecodedHeader(header.mime2DecodedAuthor || "");
      const recipient = column === "recipientCol" || (column === "correspondentCol" && authors.some(author =>
        MailServices.accounts.allIdentities.some(identity => identity.email && identity.email.toLowerCase() === author.email.toLowerCase())));
      const addresses = recipient ? MailServices.headerParser.parseDecodedHeader(header.mime2DecodedRecipients || "") : authors;
      const address = addresses[0]?.email?.trim().toLowerCase() || "";
      return address;
    } catch { return ""; }
  }

  setNicknameSenders(addresses) {
    if (!Array.isArray(addresses) || addresses.length > 100 || addresses.some(address =>
      typeof address !== "string" || address.length > 320 || !/^[^\s<>@]+@[^\s<>@]+$/.test(address))) throw new Error("Invalid notification senders");
    this.nicknameSenders = new Set(addresses.map(address => address.toLowerCase()));
    this.nicknameCards?.clear();
    if (this.running) this.resetAvatars();
  }

  avatarIdentity(header, column) {
    const address = this.correspondentAddress(header, column);
    if (!this.nicknameSenders?.has(address) || column === "recipientCol") return address;
    try {
      const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
      const authors = MailServices.headerParser.parseDecodedHeader(header.mime2DecodedAuthor || "");
      if (authors.length !== 1 || authors[0].email.toLowerCase() !== address) return address;
      const matches = [...(authors[0].name || "").matchAll(/(?:^|[\s(])@([\p{L}\p{N}_.-]{1,64})(?=$|[\s)])/gu)];
      return matches.length === 1 ? JSON.stringify([address, matches[0][1]]) : address;
    } catch { return address; }
  }

  async getContactPhoto(address, nickname = "") {
    const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
    for (const directory of MailServices.ab.directories) {
      if (directory.isRemote) continue;
      try {
        const photo = await this.readContactPhoto(directory.cardForEmailAddress(address));
        if (photo) return photo;
      } catch {}
    }
    if (!this.nicknameSenders?.has(address) || !/^[\p{L}\p{N}_.-]{1,64}$/u.test(nickname)) return "";
    this.nicknameCards ??= new Map();
    if (!this.nicknameCards.has(nickname)) {
      const matches = [];
      try {
        for (const directory of MailServices.ab.directories) {
          if (directory.isRemote) continue;
          matches.push(...directory.getCardsFromProperty("NickName", nickname, true));
          if (matches.length > 1) break;
        }
      } catch { return ""; }
      if (this.nicknameCards.size >= 512) this.nicknameCards.clear();
      this.nicknameCards.set(nickname, matches.length === 1 ? matches[0] : null);
    }
    return this.readContactPhoto(this.nicknameCards.get(nickname));
  }

  async readContactPhoto(card) {
      try {
        const photo = card?.photoURL || "";
        if (photo.length <= 350000 && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*$/.test(photo)) return photo;
        if (!photo.startsWith("file:")) return "";
        const file = Services.io.newURI(photo).QueryInterface(Ci.nsIFileURL).file;
        const photos = Services.dirsvc.get("ProfD", Ci.nsIFile); photos.append("Photos");
        if (!photos.contains(file) || file.fileSize > 262144) return "";
        const bytes = await IOUtils.read(file.path, {maxBytes: 262144});
        const mime = bytes[0] === 137 && bytes[1] === 80 ? "png" : bytes[0] === 255 && bytes[1] === 216 ? "jpeg" : bytes[0] === 71 && bytes[1] === 73 ? "gif" : bytes[0] === 82 && bytes[1] === 73 ? "webp" : "";
        if (mime) return "data:image/" + mime + ";base64," + ChromeUtils.base64URLEncode(bytes, {pad: true}).replace(/-/g, "+").replace(/_/g, "/");
      } catch {}
    return "";
  }

  getAvatar(address) {
    if (!address || !this.avatarResults) return "";
    if (!this.avatarResults.has(address)) {
      this.avatarResults.set(address, "");
      while (this.avatarResults.size > 512) this.avatarResults.delete(this.avatarResults.keys().next().value);
      for (const listener of this.avatarListeners || []) listener(address, this.avatarGeneration);
    }
    return this.avatarResults.get(address) || "";
  }

  refreshAvatars() {
    for (const doc of this.documents?.keys() || []) {
      const win = doc.defaultView;
      win.dispatchEvent(new win.Event("lmc-avatars-changed"));
    }
  }

  resetAvatars() {
    this.avatarGeneration++;
    this.nicknameCards?.clear();
    this.avatarResults?.clear();
    this.refreshAvatars();
  }

  setAvatar(address, image, generation) {
    if (typeof image !== "string" || image.length > 48000 || (image && !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(image))) throw new Error("Invalid avatar image");
    if (!this.running || generation !== this.avatarGeneration || !this.avatarResults.has(address)) return;
    this.avatarResults.set(address, image);
    this.refreshAvatars();
  }

  setSeparateTags(enabled) {
    if (typeof enabled !== "boolean") throw new Error("Invalid layout setting");
    if (!this.running) return;
    this.options.separateTags = enabled;
    for (const doc of this.documents.keys()) {
      const win = doc.defaultView;
      win.dispatchEvent(new win.Event("lmc-layout-changed"));
    }
  }

  readRow(win, row) {
    try {
      const view = win.gDBView;
      const descriptor = this.threads.describeRow(win, row);
      if (!descriptor) return null;
      const { root, header, headers, collapsed } = descriptor;
      const senderColumn = win.threadPane?.cardColumns[1] || "correspondentCol";
      const texts = view.cellDataForColumns(row.index, ["subjectCol", senderColumn, "dateCol"], {}, {});
      const nativeSummary = { subject: texts[0], sender: texts[1], date: texts[2] };
      const summary = collapsed ? this.formatSummary(header, senderColumn) : null;
      let preview = "";
      try { preview = header.getStringProperty("preview"); } catch {}
      let previewId = 0;
      try { previewId = header.getUint32Property("gloda-id"); } catch {}
      return {
        key: header.folder.URI + "#" + header.messageKey,
        rowKey: root.folder.URI + "#" + root.messageKey + "#" + root.messageId,
        displayName: summary?.sender ?? nativeSummary.sender,
        address: this.correspondentAddress(header, senderColumn),
        avatarKey: this.avatarIdentity(header, senderColumn),
        headers,
        nativeSummary,
        summary,
        preview,
        previewId,
        messageId: header.messageId || "",
      };
    } catch {
      return null;
    }
  }

  formatSummary(header, senderColumn) {
    const { DisplayNameUtils } = ChromeUtils.importESModule("resource:///modules/DisplayNameUtils.sys.mjs");
    const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
    let recipient = senderColumn === "recipientCol";
    if (senderColumn === "correspondentCol") {
      const addresses = MailServices.headerParser.parseDecodedHeader(header.mime2DecodedAuthor);
      recipient = addresses.some(address => MailServices.accounts.allIdentities.some(identity =>
        identity.email && identity.email.toLowerCase() === address.email.toLowerCase()));
    }
    const date = new Date(header.dateInSeconds * 1000);
    const today = date.toDateString() === new Date().toDateString();
    // shortcut: summary dates use the default local format, add custom date prefs if requested.
    const formatter = new Services.intl.DateTimeFormat(undefined, today
      ? { timeStyle: "short" } : { dateStyle: "short", timeStyle: "short" });
    return {
      subject: (header.flags & Ci.nsMsgMessageFlags.HasRe ? "Re: " : "") + header.mime2DecodedSubject,
      sender: DisplayNameUtils.formatDisplayNameList(recipient ? header.mime2DecodedRecipients : header.mime2DecodedAuthor, recipient ? "to" : "from"),
      date: formatter.format(date),
    };
  }

  loadPreviews(win, rows, done) {
    let collection = null;
    let timer = null;
    let active = true;
    const cancel = () => {
      active = false;
      if (timer !== null) win.clearTimeout(timer);
      if (collection) collection._listener = null;
      collection = null;
    };
    const finish = items => {
      if (!active) return;
      const results = new Map();
      for (const item of items) {
        const row = rows.find(data => data.previewId === item.id && data.messageId === item.headerMessageID &&
          data.key === item.folder?.uri + "#" + item.messageKey);
        if (row) results.set(row.key + "#" + row.messageId + "#" + row.previewId, item.indexedBodyText);
      }
      cancel();
      done(results);
    };
    try {
      if (!Services.prefs.getBoolPref("mailnews.database.global.indexer.enabled", false)) {
        finish([]);
        return cancel;
      }
      // Import the query API only, not GlodaPublic which initializes the indexer.
      const { Gloda } = ChromeUtils.importESModule("resource:///modules/gloda/Gloda.sys.mjs");
      const query = Gloda.newQuery(102);
      query.id(...new Set(rows.map(row => row.previewId)));
      timer = win.setTimeout(() => finish([]), 10000);
      collection = query.getCollection({
        onItemsAdded() {}, onItemsModified() {}, onItemsRemoved() {},
        onQueryCompleted: result => finish(result.items),
      });
    } catch {
      finish([]);
    }
    return cancel;
  }

  loadStyles() {
    if (this.styleSheets?.length) return;
    this.styleService = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
    this.styleSheets = [];
    try {
      for (const name of ["interface.css", "content.css"]) {
        const uri = Services.io.newURI(this.extension.getURL("styles/" + name) + "?v=" + encodeURIComponent(this.extension.manifest.version));
        this.styleService.loadAndRegisterSheet(uri, this.styleService.USER_SHEET);
        this.styleSheets.push(uri);
      }
    } catch (error) {
      this.unloadStyles();
      throw error;
    }
  }

  unloadStyles() {
    for (const uri of this.styleSheets || []) {
      if (this.styleService.sheetRegistered(uri, this.styleService.USER_SHEET)) {
        this.styleService.unregisterSheet(uri, this.styleService.USER_SHEET);
      }
    }
    this.styleSheets = [];
  }

  start(options) {
    if (this.running) return;
    if (typeof options?.missingPreview !== "string") throw new Error("Invalid preview label");
    this.options = options;
    this.windows = new Map();
    this.documents = new Map();
    this.avatarResults = new Map();
    this.avatarGeneration = 0;
    this.contactObserver = () => this.resetAvatars();
    this.contactTopics = ["addrbook-contact-created", "addrbook-contact-updated", "addrbook-contact-deleted", "addrbook-directory-deleted", "addrbook-directory-synced"];
    const scope = {};
    // Gecko 157 requires an explicit opt-in for this fixed, packaged extension URL.
    Services.scriptloader.loadSubScriptWithOptions(this.extension.getURL("experiment/cards.js"), {
      target: scope, charset: "UTF-8", allowUnsafeURL: true,
    });
    this.cards = scope.LimeCards;
    Services.scriptloader.loadSubScriptWithOptions(this.extension.getURL("experiment/tags.js"), {
      target: scope, charset: "UTF-8", allowUnsafeURL: true,
    });
    this.tags = scope.LimeTags;
    Services.scriptloader.loadSubScriptWithOptions(this.extension.getURL("experiment/threads.js"), {
      target: scope, charset: "UTF-8", allowUnsafeURL: true,
    });
    this.threads = scope.LimeThreads;
    this.support = ChromeUtils.importESModule("resource:///modules/ExtensionSupport.sys.mjs").ExtensionSupport;
    this.loadStyles();
    this.running = true;
    for (const topic of this.contactTopics) Services.obs.addObserver(this.contactObserver, topic);
    this.support.registerWindowListener(this.extension.id, {
      chromeURLs: ["chrome://messenger/content/messenger.xhtml"],
      onLoadWindow: win => this.attachMainWindow(win),
      onUnloadWindow: win => this.detachMainWindow(win),
    });
  }

  attachMainWindow(win) {
    if (!this.running || this.windows.has(win)) return;
    const browsers = new Set();
    const scan = () => {
      if (!this.running) return;
      for (const tab of win.document.getElementById("tabmail")?.tabInfo || []) {
        const browser = tab.chromeBrowser;
        if (!browser) continue;
        // Browser document loads do not bubble to the outer window.
        if (!browsers.has(browser)) {
          browser.addEventListener("load", scan, true);
          browsers.add(browser);
        }
        const pane = browser.contentWindow;
        if (pane?.document?.documentURI === "about:3pane" && pane.document.readyState === "complete") {
          this.attachDocument(pane, win);
        }
      }
    };
    const close = event => {
      const browser = event.detail?.tabInfo?.chromeBrowser;
      if (browsers.delete(browser)) browser.removeEventListener("load", scan, true);
    };
    win.addEventListener("TabOpen", scan);
    win.addEventListener("TabSelect", scan);
    win.addEventListener("TabClose", close);
    this.windows.set(win, { browsers, close, scan });
    scan();
  }

  attachDocument(win, main) {
    if (!this.running || !win || this.documents.has(win.document) || !win.document.getElementById("threadTree")) return;
    const doc = win.document;
    const sheet = doc.createElementNS("http://www.w3.org/1999/xhtml", "link");
    sheet.rel = "stylesheet";
    // Gecko can retain the previous sheet across an in-place add-on update.
    sheet.href = this.extension.getURL("experiment/cards.css") + "?v=" + encodeURIComponent(this.extension.manifest.version);
    doc.head.append(sheet);
    let dispose;
    let tags;
    let notificationService;
    const tagChanges = () => win.dispatchEvent(new win.Event("lmc-tags-changed"));
    const tagListener = { msgPropertyChanged(header, property) {
      if (property === "keywords") tagChanges();
    } };
    try {
      const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
      tags = this.tags.create(win, {
        tagService: MailServices.tags, label: this.options.tagLabel,
        removeLabel: this.options.removeTagLabel,
        removeThreadLabel: this.options.removeThreadTagLabel,
        headersForRow: row => this.threads.describeRow(win, row)?.headers || [],
      });
      dispose = this.cards.attach(win, {
        settings: this.options,
        missingPreview: this.options.missingPreview,
        readRow: row => this.readRow(win, row),
        getAvatar: address => this.getAvatar(address),
        loadPreviews: (rows, done) => this.loadPreviews(win, rows, done),
        tags,
      });
      Services.prefs.addObserver("mailnews.tags.", tagChanges);
      notificationService = MailServices.mfn;
      notificationService.addListener(tagListener, Ci.nsIMsgFolderNotificationService.msgPropertyChanged);
    } catch {
      notificationService?.removeListener(tagListener);
      Services.prefs.removeObserver("mailnews.tags.", tagChanges);
      dispose?.();
      tags?.dispose();
      sheet.remove();
      console.error("Lime Mail Cards: incompatible message list");
      return;
    }
    const cleanup = () => {
      win.removeEventListener("unload", cleanup);
      Services.prefs.removeObserver("mailnews.tags.", tagChanges);
      notificationService.removeListener(tagListener);
      dispose();
      sheet.remove();
      this.documents.delete(doc);
    };
    this.documents.set(doc, { main, cleanup });
    win.addEventListener("unload", cleanup, { once: true });
  }

  detachMainWindow(win) {
    const handlers = this.windows?.get(win);
    if (!handlers) return;
    win.removeEventListener("TabOpen", handlers.scan);
    win.removeEventListener("TabSelect", handlers.scan);
    win.removeEventListener("TabClose", handlers.close);
    for (const browser of handlers.browsers) browser.removeEventListener("load", handlers.scan, true);
    for (const entry of this.documents.values()) {
      if (entry.main === win) entry.cleanup();
    }
    this.windows.delete(win);
  }

  stop() {
    this.unloadStyles();
    if (!this.running) return;
    this.running = false;
    this.nicknameCards?.clear();
    for (const topic of this.contactTopics || []) Services.obs.removeObserver(this.contactObserver, topic);
    this.avatarResults?.clear();
    for (const win of this.windows.keys()) this.detachMainWindow(win);
    this.support.unregisterWindowListener(this.extension.id);
    this.cards = null;
    this.tags = null;
    this.threads = null;
  }

  onShutdown(isAppShutdown) {
    this.stop();
    if (!isAppShutdown) Services.obs.notifyObservers(null, "startupcache-invalidate");
  }
};
