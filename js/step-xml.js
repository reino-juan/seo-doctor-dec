// Step 2 UI: upload the report completed by the market, pick locales, download the XML.
// Relies on pagetype.js, xml.js and app.js, loaded before it in index.html.
(() => {
  const fileInput = document.getElementById('xml-file');
  const uploadButton = document.getElementById('xml-upload-button');
  const fileName = document.getElementById('xml-file-name');
  const loading = document.getElementById('xml-loading');
  const clearButton = document.getElementById('xml-clear-button');
  const errorBox = document.getElementById('xml-upload-error');
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

  // Flag = country part of the locale (es-ES -> assets/flags/es.svg).
  localeList.innerHTML = XML_LOCALES.map((locale) => {
    const country = locale.split('-')[1].toLowerCase();
    return `<label class="locale"><input type="checkbox" value="${locale}" />
      <img class="flag" src="assets/flags/${country}.svg" alt="" width="20" height="15" /> ${locale}</label>`;
  }).join('');
  const localeBoxes = [...localeList.querySelectorAll('input')];
  const selectedLocales = () => localeBoxes.filter((box) => box.checked).map((box) => box.value);

  uploadButton.addEventListener('click', () => fileInput.click());
  enableDrop(uploadButton, handleFile);
  clearButton.addEventListener('click', reset);
  localeList.addEventListener('change', updateDownload);
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) handleFile(file);
    fileInput.value = ''; // allow re-uploading the same file
  });

  downloadButton.addEventListener('click', () => {
    const xml = buildXml(entries, selectedLocales());
    downloadBlob(new Blob([xml], { type: 'application/xml' }), xmlFileName());
  });

  function reset() {
    entries = [];
    resultBox.hidden = true;
    errorBox.hidden = true;
    skippedBox.hidden = true;
    fileName.textContent = '';
    clearButton.hidden = true;
    localeBoxes.forEach((box) => (box.checked = false));
  }

  async function handleFile(file) {
    reset();
    fileName.textContent = file.name;
    loading.hidden = false;
    uploadButton.disabled = true;

    try {
      const rows = await readRows(file);
      const { records, missing } = mapColumns(rows, XML_COLUMN_SPECS);
      if (missing.length) {
        return showError(`This is not a completed report. Missing column(s): ${missing.join(', ')}.`);
      }

      const result = buildXmlEntries(records);
      entries = result.entries;
      site.textContent = siteName(records[0]?.Address);
      showFinding(result.skipped.length);
      showSkipped(result.skipped);
      resultBox.hidden = false;
      updateDownload();
    } catch (err) {
      showError(`Could not read the file: ${err.message}`);
    } finally {
      loading.hidden = true;
      uploadButton.disabled = false;
      clearButton.hidden = false;
    }
  }

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

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }
})();
