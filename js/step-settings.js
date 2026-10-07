// Settings UI: edit the shared locale and catalog lists (settings.js).
// Relies on settings.js and app.js, loaded before it in index.html.
(() => {
  /**
   * Wires one list: add form, list with Remove buttons, "Restore the default list".
   * `clean(text)` returns the item to add, or '' when the text is not valid (shows `invalid`).
   * `label(item)` returns the nodes shown for an item.
   */
  function listEditor({ name, prefix, clean, invalid, label }) {
    const form = document.getElementById(`${prefix}-add`);
    const input = document.getElementById(`${prefix}-new`);
    const list = document.getElementById(`${prefix}-list`);
    const count = document.getElementById(`${prefix}-count`);
    const error = document.getElementById(`${prefix}-error`);

    function render(items) {
      count.textContent = `${items.length} ${plural(items.length, 'item', 'items')}`;
      list.replaceChildren(
        ...items.map((item) => {
          const row = document.createElement('li');
          const text = document.createElement('span');
          text.className = 'settings-item';
          text.append(...label(item));
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'link-button';
          remove.textContent = 'Remove';
          remove.setAttribute('aria-label', `Remove ${item}`);
          remove.addEventListener('click', () => settings.set(name, settings.get(name).filter((other) => other !== item)));
          row.append(text, remove);
          return row;
        })
      );
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const item = clean(input.value);
      error.hidden = Boolean(item) || !input.value.trim();
      error.textContent = invalid;
      if (!item) return;
      const items = settings.get(name);
      if (!items.includes(item)) settings.set(name, [...items, item]);
      input.value = '';
      input.focus();
    });
    input.addEventListener('input', () => (error.hidden = true));
    document.getElementById(`${prefix}-reset`).addEventListener('click', () => settings.reset(name));

    settings.onChange(name, render);
    render(settings.get(name));
  }

  listEditor({
    name: 'locales',
    prefix: 'locale',
    clean: normalizeLocale,
    invalid: 'Write a locale as language-COUNTRY, e.g. pt-PT (or just the language, e.g. fr).',
    label: (locale) => [flagFor(locale), ` ${locale}`],
  });

  listEditor({
    name: 'catalogs',
    prefix: 'catalog',
    clean: (text) => (/^\S+$/.test(text.trim()) ? text.trim() : ''),
    invalid: 'A catalog ID has no spaces, e.g. ysl-master-catalog.',
    label: (catalog) => [catalog],
  });
})();
