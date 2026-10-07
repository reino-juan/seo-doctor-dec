// Metadata Step 2 UI: upload the completed report (plus the crawl when it has no IDs), pick the
// locale and catalogs, download one XML per type. Also the "Manage catalogs" settings.
// Relies on metadata.js and app.js, loaded before it in index.html.
(() => {
  const CATALOGS_KEY = 'seo-dector.catalogs'; // localStorage: the user's catalog list

  const resultBox = document.getElementById('metax-result');
  const site = document.getElementById('metax-site');
  const finding = document.getElementById('metax-finding');
  const advice = document.getElementById('metax-advice');
  const skippedBox = document.getElementById('metax-skipped');
  const skippedTitle = document.getElementById('metax-skipped-title');
  const skippedRows = document.getElementById('metax-skipped-rows');
  const settings = document.getElementById('metax-settings');
  const localeSelect = document.getElementById('metax-locale');
  const exportList = document.getElementById('metax-exports');
  const hint = document.getElementById('metax-hint');
  const crawlDetails = document.getElementById('metac-details');

  let records = null; // rows of the completed report
  let crawlPages = null; // pages of the optional crawl
  let result = null; // buildMetaEntries
  const chosenCatalog = {}; // type -> catalog picked in this session

  localeSelect.append(new Option('Choose a locale', ''), ...META_LOCALES.map((locale) => new Option(locale, locale)));
  localeSelect.addEventListener('change', updateButtons);

  const intake = createIntake({
    input: document.getElementById('metax-file'),
    dropzone: document.getElementById('metax-upload-button'),
    fileName: document.getElementById('metax-file-name'),
    loading: document.getElementById('metax-loading'),
    clearButton: document.getElementById('metax-clear-button'),
    errorBox: document.getElementById('metax-upload-error'),
    picker: document.getElementById('metax-sheet-picker'),
    sheetName: document.getElementById('metax-sheet-name'),
    changeSheetButton: document.getElementById('metax-change-sheet'),
    specs: META_XML_SPECS,
    onReset: () => {
      records = null;
      update();
    },
    onRows: (rows) => {
      const mapped = mapColumns(rows, META_XML_SPECS);
      if (mapped.missing.length) {
        return intake.showError(`This is not a completed report. Missing column(s): ${mapped.missing.join(', ')}.`);
      }
      records = mapped.records;
      update();
    },
  });

  const crawlIntake = createIntake({
    input: document.getElementById('metac-file'),
    dropzone: document.getElementById('metac-upload-button'),
    fileName: document.getElementById('metac-file-name'),
    loading: document.getElementById('metac-loading'),
    clearButton: document.getElementById('metac-clear-button'),
    errorBox: document.getElementById('metac-upload-error'),
    picker: document.getElementById('metac-sheet-picker'),
    sheetName: document.getElementById('metac-sheet-name'),
    changeSheetButton: document.getElementById('metac-change-sheet'),
    specs: META_CRAWL_SPECS,
    onReset: () => {
      crawlPages = null;
      update();
    },
    onRows: (rows) => {
      const checked = checkMetadata(rows);
      if (checked.missing.length) {
        return crawlIntake.showError(`This is not a valid crawl. Missing column(s): ${checked.missing.join(', ')}.`);
      }
      crawlPages = checked.pages;
      update();
    },
  });

  function update() {
    result = records ? buildMetaEntries(records, crawlPages) : null;
    resultBox.hidden = !result;
    if (!result) return;

    site.textContent = siteName(records[0]?.URL);
    const counts = META_TYPES.map((t) => ({ ...t, count: result.byType[t.type].length })).filter((t) => t.count > 0);
    const total = counts.reduce((sum, t) => sum + t.count, 0);
    const addCrawl =
      result.needCrawl > 0
        ? ` ${result.needCrawl} ${plural(result.needCrawl, 'row has', 'rows have')} no type or ID: add the crawl of the site (optional section above) to include ${plural(result.needCrawl, 'it', 'them')}.`
        : '';

    if (total > 0) {
      setFinding(finding, total, `${plural(total, 'page', 'pages')} will get new metadata.`);
      const parts = counts.map((t) => `${t.count} ${plural(t.count, t.one, t.many)}`);
      const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
      advice.textContent = `${list}. Choose the locale of the texts and the catalogs, then download one XML per type.${addCrawl}`;
    } else {
      finding.textContent = 'No pages to update.';
      advice.textContent = addCrawl
        ? addCrawl.trim()
        : result.skipped.length > 0
          ? 'Every row with a new text was left out. Check the rows below.'
          : 'No row has a DEC Title or DEC Description filled in.';
    }
    if (result.needCrawl > 0) crawlDetails.open = true;
    settings.hidden = total === 0;
    showSkipped(result.skipped);
    renderExports(counts);
  }

  function showSkipped(skipped) {
    const count = skipped.length;
    skippedBox.hidden = count === 0;
    setFinding(skippedTitle, count, `${plural(count, 'row was', 'rows were')} left out of the XML.`, { alert: true });
    skippedRows.replaceChildren(
      ...skipped.map((row) => {
        const tr = document.createElement('tr');
        [row.url, row.type, row.id, row.reason].forEach((text) => {
          const td = document.createElement('td');
          td.textContent = text;
          tr.append(td);
        });
        return tr;
      })
    );
  }

  // One row per type: count, catalog (products, categories) and download button.
  function renderExports(counts) {
    exportList.replaceChildren(
      ...counts.map((t) => {
        const row = document.createElement('div');
        row.className = 'export-row';
        row.dataset.type = t.type;

        const label = document.createElement('span');
        label.className = 'export-name';
        setFinding(label, t.count, plural(t.count, t.one, t.many));
        row.append(label);

        if (t.catalog) {
          const select = document.createElement('select');
          select.className = 'select';
          select.setAttribute('aria-label', `Catalog for ${t.many}`);
          const options = catalogsFor(t.type, catalogs);
          select.append(new Option('Choose a catalog', ''), ...options.map((name) => new Option(name, name)));
          select.value = options.includes(chosenCatalog[t.type]) ? chosenCatalog[t.type] : '';
          select.addEventListener('change', () => {
            chosenCatalog[t.type] = select.value;
            updateButtons();
          });
          row.append(select);
        } else {
          const note = document.createElement('span');
          note.className = 'export-note';
          note.textContent = 'Site library, no catalog needed';
          row.append(note);
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-primary';
        button.textContent = 'Download XML';
        button.addEventListener('click', () => download(t.type, row.querySelector('select')?.value ?? ''));
        row.append(button);
        return row;
      })
    );
    updateButtons();
  }

  function updateButtons() {
    const locale = localeSelect.value;
    let needsCatalog = false;
    exportList.querySelectorAll('.export-row').forEach((row) => {
      const select = row.querySelector('select');
      const missingCatalog = select ? !select.value : false;
      needsCatalog ||= missingCatalog;
      row.querySelector('button').disabled = !locale || missingCatalog;
    });
    const missing = [!locale && 'a locale', needsCatalog && 'a catalog'].filter(Boolean);
    hint.textContent = missing.length ? `Choose ${missing.join(' and ')} to download.` : '';
    hint.hidden = !missing.length;
  }

  function download(type, catalog) {
    const locale = localeSelect.value;
    const xml = buildMetaXml(type, result.byType[type], { locale, catalog });
    downloadBlob(new Blob([xml], { type: 'application/xml' }), metaXmlFileName(records[0]?.URL, type, locale));
  }

  // ---------- Manage catalogs (kept in this browser) ----------

  const catalogList = document.getElementById('catalog-list');
  const addForm = document.getElementById('catalog-add');
  const newCatalog = document.getElementById('catalog-new');
  let catalogs = loadCatalogs();

  function loadCatalogs() {
    try {
      const saved = JSON.parse(localStorage.getItem(CATALOGS_KEY));
      if (Array.isArray(saved)) return saved;
    } catch {
      // No storage (private window, blocked site data): use the defaults.
    }
    return [...DEFAULT_CATALOGS];
  }

  function setCatalogs(list, { save = true } = {}) {
    catalogs = [...new Set(list)].sort((a, b) => a.localeCompare(b));
    if (save) {
      try {
        localStorage.setItem(CATALOGS_KEY, JSON.stringify(catalogs));
      } catch {
        // Not saved; the change still applies until the page is closed.
      }
    }
    renderCatalogs();
    if (result) update();
  }

  function renderCatalogs() {
    catalogList.replaceChildren(
      ...catalogs.map((name) => {
        const item = document.createElement('li');
        const text = document.createElement('span');
        text.textContent = name;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'link-button';
        remove.textContent = 'Remove';
        remove.setAttribute('aria-label', `Remove ${name}`);
        remove.addEventListener('click', () => setCatalogs(catalogs.filter((other) => other !== name)));
        item.append(text, remove);
        return item;
      })
    );
  }

  addForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = newCatalog.value.trim();
    if (!name) return;
    setCatalogs([...catalogs, name]);
    newCatalog.value = '';
    newCatalog.focus();
  });

  document.getElementById('catalog-reset').addEventListener('click', () => {
    try {
      localStorage.removeItem(CATALOGS_KEY);
    } catch {
      // Nothing saved to remove.
    }
    setCatalogs(DEFAULT_CATALOGS, { save: false });
  });

  setCatalogs(catalogs, { save: false });
})();
