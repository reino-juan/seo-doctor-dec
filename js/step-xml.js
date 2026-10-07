// Step 2 UI: upload the report completed by the market, pick locales, download the XML.
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

  let entries = [];

  const localeChoice = localeCheckboxes(localeList, () => updateDownload());
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
      entries = [];
      resultBox.hidden = true;
      skippedBox.hidden = true;
      localeChoice.clear();
    },
    onRows: (rows) => {
      const { records, missing } = mapColumns(rows, XML_COLUMN_SPECS);
      if (missing.length) {
        return intake.showError(`This is not a completed report. Missing column(s): ${missing.join(', ')}.`);
      }

      const result = buildXmlEntries(records);
      entries = result.entries;
      site.textContent = siteName(records[0]?.Address);
      showFinding(result.skipped.length);
      showSkipped(result.skipped);
      resultBox.hidden = false;
      updateDownload();
    },
  });

  downloadButton.addEventListener('click', () => {
    const xml = buildXml(entries, selectedLocales());
    downloadBlob(new Blob([xml], { type: 'application/xml' }), xmlFileName());
  });

  function showFinding(skippedCount) {
    const count = entries.length;
    localeSet.hidden = count === 0;
    if (count > 0) {
      setFinding(finding, count, `${plural(count, 'page', 'pages')} will get ${plural(count, 'its', 'their')} new page type.`);
      advice.textContent = 'Tick the locales of this site and download the XML for the library import.';
    } else if (skippedCount > 0) {
      finding.textContent = 'No pages to update.';
      advice.textContent = 'Every page type the market filled in was left out. Check the rows below with the market.';
    } else {
      finding.textContent = 'No pages to update.';
      advice.textContent =
        'The XML only includes pages with a Page Designer ID where the market chose a page type in the GEO Page Type to Implement column. No row in this file has both.';
    }
  }

  function showSkipped(skipped) {
    const count = skipped.length;
    skippedBox.hidden = count === 0;
    setFinding(skippedTitle, count, `${plural(count, 'row was', 'rows were')} left out. Check ${plural(count, 'it', 'them')} with the market.`, {
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

  function updateDownload() {
    const noLocale = selectedLocales().length === 0;
    downloadButton.disabled = entries.length === 0 || noLocale;
    localeHint.hidden = !noLocale || entries.length === 0;
  }
})();
