/* SPDX-License-Identifier: MPL-2.0 */
var LimeThreads = (() => {
  function describeRow(win, row) {
    try {
      const view = win.gDBView;
      const index = row.index;
      if (!view || !Number.isInteger(index) || index < 0 || index >= view.rowCount) return null;
      const root = view.getMsgHdrAt(index);
      if (!root?.folder) return null;
      const collapsed = win.gViewWrapper?.isCollapsedThreadAtIndex(index) === true;
      const headers = [];
      let header = root;
      if (collapsed) {
        // The view thread also preserves membership across folders and saved searches.
        const thread = view.getThreadContainingIndex(index);
        const count = thread.numChildren;
        for (let i = 0; i < count; i++) {
          const child = thread.getChildHdrAt(i);
          if (!child?.folder) return null;
          headers.push(child);
          if (child.dateInSeconds > header.dateInSeconds) header = child;
        }
        if (!headers.length) return null;
      } else {
        headers.push(root);
      }
      return { root, header, headers, collapsed };
    } catch {
      return null;
    }
  }

  return { describeRow };
})();
