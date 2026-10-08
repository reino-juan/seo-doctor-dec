// Bookmarklets UI: one line per bookmarklet (name + what it does); the arrow opens its code with
// Copy and a link to drag to the bookmarks bar. Relies on bookmarklets.js, loaded before it.
(() => {
  const list = document.getElementById('bookmarklet-list');

  // Clipboard API where allowed; otherwise the old select + copy (some file:// pages).
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    }
  }

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  list.replaceChildren(
    ...BOOKMARKLETS.map(({ name, description, code }) => {
      const item = el('details', 'bookmarklet');
      const summary = el('summary', 'bookmarklet-summary');
      summary.append(el('span', 'bookmarklet-name', name), el('span', 'bookmarklet-desc', description));

      const codeBlock = el('pre', 'code-block');
      codeBlock.append(el('code', '', code));

      const copyButton = el('button', 'btn btn-quiet', 'Copy code');
      copyButton.type = 'button';
      const status = el('span', 'hint copy-status');
      status.setAttribute('role', 'status');
      copyButton.addEventListener('click', async () => {
        status.textContent = (await copy(code)) ? 'Copied. Paste it as the URL of a new bookmark.' : 'Could not copy: select the code and copy it by hand.';
      });

      // Dragging this link to the bookmarks bar creates the bookmark; clicking it would run the
      // bookmarklet on this page, so clicks are ignored.
      const drag = el('a', 'btn btn-quiet drag-link', `Drag “${name}” to bookmarks bar`);
      drag.href = code;
      drag.title = 'Drag me to your bookmarks bar';
      drag.addEventListener('click', (event) => event.preventDefault());

      const actions = el('div', 'action-row bookmarklet-actions');
      actions.append(copyButton, drag, status);
      const body = el('div', 'bookmarklet-body');
      body.append(codeBlock, actions);

      item.append(summary, body);
      return item;
    })
  );
})();
