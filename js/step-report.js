// Step 1 UI: upload a crawl, validate page types, download the Excel report.
// Relies on pagetype.js, report.js and app.js, loaded before it in index.html.
(() => {
  const fileInput = document.getElementById('crawl-file');
  const uploadButton = document.getElementById('upload-button');
  const fileName = document.getElementById('file-name');
  const loading = document.getElementById('loading');
  const errorBox = document.getElementById('upload-error');
  const resultBox = document.getElementById('result');
  const incorrectCount = document.getElementById('incorrect-count');
  const incorrectNoun = document.getElementById('incorrect-noun');
  const totalCount = document.getElementById('total-count');
  const totalNoun = document.getElementById('total-noun');
  const downloadButton = document.getElementById('download-button');
  const clearButton = document.getElementById('clear-button');

  let report = null; // { records, statuses }

  uploadButton.addEventListener('click', () => fileInput.click());
  clearButton.addEventListener('click', reset);
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) handleFile(file);
    fileInput.value = ''; // allow re-uploading the same file
  });

  downloadButton.addEventListener('click', async () => {
    if (!report) return;
    downloadButton.disabled = true;
    try {
      const blob = await buildReport(report.records, report.statuses);
      downloadBlob(blob, reportFileName(report.records[0]?.Address));
    } catch (err) {
      showError(`Could not build the report: ${err.message}`);
    } finally {
      downloadButton.disabled = false;
    }
  });

  function reset() {
    report = null;
    resultBox.hidden = true;
    errorBox.hidden = true;
    fileName.textContent = '';
    clearButton.hidden = true;
  }

  async function handleFile(file) {
    reset();
    fileName.textContent = file.name;
    loading.hidden = false;
    uploadButton.disabled = true;

    try {
      const rows = await readRows(file);
      const { records, missing } = mapCrawl(rows);
      if (missing.length) {
        return showError(`This is not a valid crawl. Missing column(s): ${missing.join(', ')}.`);
      }
      if (!records.length) return showError('The crawl does not contain any URL.');

      const statuses = validate(records);
      report = { records, statuses };
      const incorrect = statuses.filter((s) => s !== 'OK').length;
      incorrectCount.textContent = incorrect;
      incorrectNoun.textContent = plural(incorrect, 'page', 'pages');
      totalCount.textContent = records.length;
      totalNoun.textContent = plural(records.length, 'URL', 'URLs');
      resultBox.hidden = false;
    } catch (err) {
      showError(`Could not read the file: ${err.message}`);
    } finally {
      loading.hidden = true;
      uploadButton.disabled = false;
      clearButton.hidden = false;
    }
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }
})();
