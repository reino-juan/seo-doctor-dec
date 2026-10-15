// Step 2 UI: upload the report completed by the market (plus the content library when it has
// content assets), pick locales, download the XML.
// Relies on pagetype.js, xml.js and app.js, loaded before it in index.html.
(() => {
  const resultBox = document.getElementById('xml-result');
  const site = document.getElementById('xml-site');
  const finding = document.getElementById('xml-finding');
  const advice = document.getElementById('xml-advice');
  const localeSet = document.getElementById('xml-locale-set');
  const localeList = document.getElementById('xml-locales');
  const localeHint = document.getElementById('xml-locale-hint');
  const skippedBox = document.getElementById('xml-skipped');
  const skippedTitle = document.getElementById('xml-skipped-title');
  const skippedRows = document.getElementById('xml-skipped-rows');
  const downloadButton = document.getElementById('xml-download-button');

  let report = null; // buildXmlEntries result: { entries, assets, skipped }
  let libraryText = ''; // the uploaded library XML
  let library = null; // readLibraryAssets for the report's content assets
  let assetResult = null; // buildAssetUpdates for the ticked locales

  const localeChoice = localeCheckboxes(localeList, () => update());
  const selectedLocales = localeChoice.selected;

  const intake = createIntake({
    input: document.getElementById('xml-file'),
    dropzone: document.getElementById('xml-upload-button'),
    fileName: document.getElementById('xml-file-name'),
    loading: document.getElementById('xml-loading'),
    clearButton: document.getElementById('xml-clear-button'),
    errorBox: document.getElementById('xml-upload-error'),
    picker: document.getElementById('xml-sheet-picker'),
    sheetName: document.getElementById('xml-sheet-name'),
    changeSheetButton: document.getElementById('xml-change-sheet'),
    specs: XML_COLUMN_SPECS,
    onReset: () => {
      report = null;
      localeChoice.clear();
      update();
    },
    onRows: (rows) => {
      const { records, missing } = mapColumns(rows, XML_COLUMN_SPECS);
      if (missing.length) {
        return intake.showError(`This is not a completed report. Missing column(s): ${missing.join(', ')}.`);
      }
      report = buildXmlEntries(records);
      site.textContent = siteName(records[0]?.Address);
      readLibrary();
      update();
    },
  });

  // ---------- Content library (.xml, read as text) ----------

  const libDetails = document.getElementById('xml-lib-details');
  const libInput = document.getElementById('xml-lib-file');
  const libZone = document.getElementById('xml-lib-upload-button');
  const libName = document.getElementById('xml-lib-file-name');
  const libLoading = document.getElementById('xml-lib-loading');
  const libClear = document.getElementById('xml-lib-clear-button');
  const libError = document.getElementById('xml-lib-error');
  let libLoadId = 0;

  libZone.addEventListener('click', () => libInput.click());
  enableDrop(libZone, loadLibrary);
  libInput.addEventListener('change', () => {
    if (libInput.files[0]) loadLibrary(libInput.files[0]);
    libInput.value = '';
  });
  libClear.addEventListener('click', () => {
    libLoadId++;
    libraryText = '';
    libName.textContent = '';
    libClear.hidden = true;
    libError.hidden = true;
    readLibrary();
    update();
  });

  async function loadLibrary(file) {
    const id = ++libLoadId;
    libError.hidden = true;
    libName.textContent = file.name;
    libLoading.hidden = false;
    libZone.disabled = true;
    try {
      const text = await file.text();
      if (id !== libLoadId) return;
      if (!/<library\b/.test(text.slice(0, 5000))) throw new Error('this is not a library export (no <library> element)');
      libraryText = text;
    } catch (err) {
      if (id !== libLoadId) return;
      libraryText = '';
      libError.textContent = `Could not read the library: ${err.message}`;
      libError.hidden = false;
    } finally {
      if (id === libLoadId) {
        libLoading.hidden = true;
        libZone.disabled = false;
        libClear.hidden = false;
      }
    }
    readLibrary();
    update();
  }

  // Looks up the report's content assets in the library (only those IDs: libraries are big).
  function readLibrary() {
    library = report && libraryText ? readLibraryAssets(libraryText, report.assets.map((asset) => asset.contentId)) : null;
  }

  // ---------- Result ----------

  downloadButton.addEventListener('click', () => {
    const xml = buildXml(report.entries, selectedLocales(), assetResult?.updates ?? []);
    downloadBlob(new Blob([xml], { type: 'application/xml' }), xmlFileName());
  });

  function update() {
    resultBox.hidden = !report;
    if (!report) return;

    const assets = report.assets;
    assetResult = library ? buildAssetUpdates(assets, library, selectedLocales()) : null;
    const waiting = library ? [] : assets.map(({ address, contentId, pageType }) => ({ address, contentId, value: pageType, reason: 'Content asset: add the library to include it' }));
    const skipped = [...report.skipped, ...(assetResult?.skipped ?? []), ...waiting];
    const pages = report.entries.length;
    const assetCount = assetResult?.updates.length ?? 0;
    const count = pages + assetCount;
    if (assets.length && !library) libDetails.open = true;

    showFinding(count, pages, assetCount, waiting.length, skipped.length, assetResult?.unchanged.length ?? 0);
    showSkipped(skipped);
    const noLocale = selectedLocales().length === 0;
    downloadButton.disabled = count === 0 || noLocale;
    localeHint.hidden = !noLocale || count === 0;
  }

  function showFinding(count, pages, assetCount, waiting, skippedCount, unchanged) {
    // Ticking a locale can leave content assets out (own jsonData), so keep the boxes while there is any.
    localeSet.hidden = report.entries.length + report.assets.length === 0;
    const already = unchanged
      ? ` ${unchanged} content ${plural(unchanged, 'asset already has', 'assets already have')} that page type in the library: nothing to change.`
      : '';
    const needLibrary = waiting
      ? ` ${waiting} content ${plural(waiting, 'asset needs', 'assets need')} the content library: add it above to include ${plural(waiting, 'it', 'them')}.`
      : '';
    if (count > 0) {
      setFinding(finding, count, `${plural(count, 'page', 'pages')} will get ${plural(count, 'its', 'their')} new page type.`);
      const split = assetCount ? ` ${pages} Page Designer ${plural(pages, 'page', 'pages')} and ${assetCount} content ${plural(assetCount, 'asset', 'assets')} (in their jsonData, x-default, keeping what they already have).` : '';
      advice.textContent = `Tick the locales of this site and download the XML for the library import.${split}${already}${needLibrary}`;
    } else {
      finding.textContent = 'No pages to update.';
      advice.textContent = needLibrary
        ? needLibrary.trim()
        : already && !skippedCount
          ? already.trim()
          : skippedCount > 0
          ? 'Every page type the market filled in was left out. Check the rows below.'
          : 'The XML only includes pages with a Page Designer ID or a Content Asset where the market chose a page type in the GEO Page Type to Implement column. No row in this file has both.';
    }
  }

  function showSkipped(skipped) {
    const count = skipped.length;
    skippedBox.hidden = count === 0;
    setFinding(skippedTitle, count, `${plural(count, 'row was', 'rows were')} left out of the XML. The reason says what to do.`, {
      alert: true,
    });
    skippedRows.replaceChildren(
      ...skipped.map((row) => {
        const tr = document.createElement('tr');
        [row.address, row.contentId, row.value, row.reason].forEach((text) => {
          const td = document.createElement('td');
          td.textContent = text;
          tr.append(td);
        });
        return tr;
      })
    );
  }
})();
