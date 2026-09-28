// Step 2 UI: upload the report completed by the market, pick locales, download the XML.
// Relies on pagetype.js, xml.js and app.js, loaded before it in index.html.
(() => {
  const fileInput = document.getElementById('xml-file');
  const uploadButton = document.getElementById('xml-upload-button');
  const fileName = document.getElementById('xml-file-name');
  const clearButton = document.getElementById('xml-clear-button');
  const errorBox = document.getElementById('xml-upload-error');
  const resultBox = document.getElementById('xml-result');
  const entryCount = document.getElementById('xml-count');
  const localeList = document.getElementById('xml-locales');
  const localeHint = document.getElementById('xml-locale-hint');
  const skippedBox = document.getElementById('xml-skipped');
  const skippedCount = document.getElementById('xml-skipped-count');
  const skippedRows = document.getElementById('xml-skipped-rows');
  const downloadButton = document.getElementById('xml-download-button');

  let entries = [];

  localeList.innerHTML = XML_LOCALES.map(
    (locale) => `<label class="locale"><input type="checkbox" value="${locale}" /> ${locale}</label>`
  ).join('');
  const localeBoxes = [...localeList.querySelectorAll('input')];
  const selectedLocales = () => localeBoxes.filter((box) => box.checked).map((box) => box.value);

  uploadButton.addEventListener('click', () => fileInput.click());
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
    clearButton.hidden = false;

    try {
      const rows = await readRows(file);
      const { records, missing } = mapColumns(rows, XML_COLUMN_SPECS);
      if (missing.length) {
        return showError(`This is not a completed report. Missing column(s): ${missing.join(', ')}.`);
      }

      const result = buildXmlEntries(records);
      entries = result.entries;
      entryCount.textContent = entries.length;
      showSkipped(result.skipped);
      resultBox.hidden = false;
      updateDownload();
    } catch (err) {
      showError(`Could not read the file: ${err.message}`);
    }
  }

  function showSkipped(skipped) {
    skippedBox.hidden = skipped.length === 0;
    skippedCount.textContent = skipped.length;
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
    localeHint.hidden = !noLocale;
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }
})();
