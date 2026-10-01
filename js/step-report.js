// Step 1 UI: upload a crawl, validate page types, download the Excel report.
// Relies on pagetype.js, report.js and app.js, loaded before it in index.html.
(() => {
  const resultBox = document.getElementById('result');
  const site = document.getElementById('result-site');
  const finding = document.getElementById('finding');
  const advice = document.getElementById('advice');
  const downloadButton = document.getElementById('download-button');

  let report = null; // { records, statuses }

  const intake = createIntake({
    input: document.getElementById('crawl-file'),
    dropzone: document.getElementById('upload-button'),
    fileName: document.getElementById('file-name'),
    loading: document.getElementById('loading'),
    clearButton: document.getElementById('clear-button'),
    errorBox: document.getElementById('upload-error'),
    picker: document.getElementById('sheet-picker'),
    sheetName: document.getElementById('sheet-name'),
    changeSheetButton: document.getElementById('change-sheet'),
    specs: COLUMN_SPECS,
    onReset: () => {
      report = null;
      resultBox.hidden = true;
    },
    onRows: (rows) => {
      const { records, missing } = mapCrawl(rows);
      if (missing.length) {
        return intake.showError(`This is not a valid crawl. Missing column(s): ${missing.join(', ')}.`);
      }
      if (!records.length) return intake.showError('The crawl does not contain any URL.');

      const statuses = validate(records);
      report = { records, statuses };
      showDiagnosis(records, statuses);
      resultBox.hidden = false;
    },
  });

  downloadButton.addEventListener('click', async () => {
    if (!report) return;
    downloadButton.disabled = true;
    try {
      const blob = await buildReport(report.records, report.statuses);
      downloadBlob(blob, reportFileName(report.records[0]?.Address));
    } catch (err) {
      intake.showError(`Could not build the report: ${err.message}`);
    } finally {
      downloadButton.disabled = false;
    }
  });

  function showDiagnosis(records, statuses) {
    const total = records.length;
    const incorrect = statuses.filter((s) => s !== 'OK').length;
    site.textContent = siteName(records[0].Address);

    if (incorrect > 0) {
      const pages = plural(total, 'page', 'pages');
      setFinding(finding, incorrect, `of ${total} ${pages} ${plural(incorrect, 'needs', 'need')} a page type.`, {
        alert: true,
      });
      advice.textContent =
        'Download the report and send it to the market. They pick the missing page types from a dropdown in the GEO Page Type to Implement column.';
    } else {
      setFinding(finding, total, `${plural(total, 'page has', 'pages have')} a valid page type.`);
      advice.textContent = 'Nothing for the market to fix. You can still download the report for your records.';
    }
  }
})();
