// H1 UI: upload a crawl, find missing and repeated H1s, download the report.
// Relies on h1.js, h1-report.js and app.js, loaded before it in index.html.
(() => {
  const resultBox = document.getElementById('h1-result');
  const site = document.getElementById('h1-site');
  const finding = document.getElementById('h1-finding');
  const advice = document.getElementById('h1-advice');
  const downloadButton = document.getElementById('h1-download-button');

  let checked = null; // checkH1 result

  const intake = createIntake({
    input: document.getElementById('h1-file'),
    dropzone: document.getElementById('h1-upload-button'),
    fileName: document.getElementById('h1-file-name'),
    loading: document.getElementById('h1-loading'),
    clearButton: document.getElementById('h1-clear-button'),
    errorBox: document.getElementById('h1-upload-error'),
    picker: document.getElementById('h1-sheet-picker'),
    sheetName: document.getElementById('h1-sheet-name'),
    changeSheetButton: document.getElementById('h1-change-sheet'),
    specs: H1_CRAWL_SPECS,
    onReset: () => {
      checked = null;
      resultBox.hidden = true;
    },
    onRows: (rows) => {
      const result = checkH1(rows);
      if (result.missing.length) {
        return intake.showError(`This is not a valid crawl. Missing column(s): ${result.missing.join(', ')}.`);
      }
      if (!result.pages.length) return intake.showError('The crawl does not contain any page with status 200.');

      checked = result;
      showDiagnosis(result);
      resultBox.hidden = false;
    },
  });

  downloadButton.addEventListener('click', async () => {
    if (!checked) return;
    downloadButton.disabled = true;
    try {
      const blob = await buildH1Report(checked);
      downloadBlob(blob, h1ReportFileName(checked.pages[0].url));
    } catch (err) {
      intake.showError(`Could not build the report: ${err.message}`);
    } finally {
      downloadButton.disabled = false;
    }
  });

  // In the italic serif "H1" reads like "III", so the finding sets it in the interface font.
  function sansH1(el) {
    const text = el.lastChild;
    const [before, after] = text.textContent.split('H1');
    const code = document.createElement('span');
    code.className = 'finding-code';
    code.textContent = 'H1';
    text.replaceWith(before, code, after);
  }

  function showDiagnosis({ pages }) {
    const total = pages.length;
    const toFix = pages.filter((page) => page.issue).length;
    const missing = pages.filter((page) => page.issue === H1_ISSUES.missing).length;
    const several = pages.filter((page) => page.issue === H1_ISSUES.several).length;
    site.textContent = siteName(pages[0].url);

    if (toFix > 0) {
      setFinding(finding, toFix, `of ${total} ${plural(total, 'page', 'pages')} ${plural(toFix, 'needs', 'need')} an H1 fix.`, {
        alert: true,
      });
      sansH1(finding);
      advice.textContent =
        `${missing} ${plural(missing, 'page has', 'pages have')} no H1 and ${several} more than one. ` +
        'Download the report and send it to the market. They write the new H1 in the H1 to implement column.';
    } else {
      setFinding(finding, total, `${plural(total, 'page has', 'pages have')} exactly one H1.`);
      sansH1(finding);
      advice.textContent = 'Nothing for the market to fix. You can still download the report for your records.';
    }
  }
})();
