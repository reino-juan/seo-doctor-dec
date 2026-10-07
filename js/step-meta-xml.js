// Metadata Step 2 UI: upload the completed report (plus the crawl when it has no IDs), tick the
// locales and type the catalogs, download one XML per type. Locales and catalog suggestions come
// from the Settings lists. Relies on metadata.js, settings.js and app.js, loaded before it.
(() => {

  const resultBox = document.getElementById('metax-result');
  const site = document.getElementById('metax-site');
  const finding = document.getElementById('metax-finding');
  const advice = document.getElementById('metax-advice');
  const skippedBox = document.getElementById('metax-skipped');
  const skippedTitle = document.getElementById('metax-skipped-title');
  const skippedRows = document.getElementById('metax-skipped-rows');
  const exportSettings = document.getElementById('metax-settings');
  const localeList = document.getElementById('metax-locales');
  const exportList = document.getElementById('metax-exports');
  const hint = document.getElementById('metax-hint');
  const crawlDetails = document.getElementById('metac-details');

  let records = null; // rows of the completed report
  let crawlPages = null; // pages of the optional crawl
  let result = null; // buildMetaEntries
  const chosenCatalog = {}; // type -> catalog typed or picked in this session

  // Same locale list and checkboxes as Page type (xml.js), but no forced x-default: a title
  // written to x-default would become the fallback of every locale of the site.
  const localeChoice = localeCheckboxes(localeList, () => updateButtons());

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
    onlySheet: META_REPORT_SHEET,
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
      advice.textContent = `${list}. Tick the locales of the texts, choose the catalogs, then download one XML per type.${addCrawl}`;
    } else {
      finding.textContent = 'No pages to update.';
      advice.textContent = addCrawl
        ? addCrawl.trim()
        : result.skipped.length > 0
          ? 'Every row with a new text was left out. Check the rows below.'
          : 'No row has a DEC Title or DEC Description filled in.';
    }
    if (result.needCrawl > 0) crawlDetails.open = true;
    exportSettings.hidden = total === 0;
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
          // A text field with suggestions: any catalog ID can be typed, listed or not.
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'text-input catalog-input';
          input.autocomplete = 'off';
          input.spellcheck = false;
          input.placeholder = t.type === 'product' ? 'Master catalog, e.g. ysl-master-catalog' : 'Navigation catalog, e.g. ysl-fr-navigation-ng';
          input.setAttribute('aria-label', `Catalog for ${t.many}`);
          input.value = chosenCatalog[t.type] ?? '';
          const options = document.createElement('datalist');
          options.id = `metax-catalogs-${t.type}`;
          options.append(...catalogsFor(t.type, settings.get('catalogs')).map((name) => new Option(name)));
          input.setAttribute('list', options.id);
          input.addEventListener('input', () => {
            chosenCatalog[t.type] = input.value.trim();
            updateButtons();
          });
          row.append(input, options);
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
        button.addEventListener('click', () => download(t.type, chosenCatalog[t.type] ?? ''));
        row.append(button);
        return row;
      })
    );
    updateButtons();
  }

  function updateButtons() {
    const noLocale = localeChoice.selected().length === 0;
    let needsCatalog = false;
    exportList.querySelectorAll('.export-row').forEach((row) => {
      const needs = META_TYPES.find((t) => t.type === row.dataset.type).catalog;
      const missingCatalog = needs && !chosenCatalog[row.dataset.type];
      needsCatalog ||= missingCatalog;
      row.querySelector('button').disabled = noLocale || missingCatalog;
    });
    const missing = [noLocale && 'at least one locale', needsCatalog && 'a catalog'].filter(Boolean);
    hint.textContent = missing.length ? `Choose ${missing.join(' and ')} to download.` : '';
    hint.hidden = !missing.length;
  }

  function download(type, catalog) {
    const locales = localeChoice.selected();
    const xml = buildMetaXml(type, result.byType[type], { locales, catalog });
    downloadBlob(new Blob([xml], { type: 'application/xml' }), metaXmlFileName(records[0]?.URL, type, locales));
    // A catalog typed by hand joins the Settings list, so it's suggested next time.
    const catalogs = settings.get('catalogs');
    if (catalog && !catalogs.includes(catalog)) settings.set('catalogs', [...catalogs, catalog]);
  }

  // Settings changed the catalog list: refresh the suggestions (typed values are kept).
  settings.onChange('catalogs', () => {
    if (result) update();
  });
})();
