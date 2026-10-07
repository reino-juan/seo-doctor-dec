// Metadata Step 1 UI: upload a crawl, check titles, descriptions and H1s, download the report.
// Relies on metadata.js, metadata-report.js and app.js, loaded before it in index.html.
(() => {
  const resultBox = document.getElementById('meta-result');
  const site = document.getElementById('meta-site');
  const finding = document.getElementById('meta-finding');
  const advice = document.getElementById('meta-advice');
  const downloadButton = document.getElementById('meta-download-button');

  let checked = null; // checkMetadata result

  const intake = createIntake({
    input: document.getElementById('meta-file'),
    dropzone: document.getElementById('meta-upload-button'),
    fileName: document.getElementById('meta-file-name'),
    loading: document.getElementById('meta-loading'),
    clearButton: document.getElementById('meta-clear-button'),
    errorBox: document.getElementById('meta-upload-error'),
    picker: document.getElementById('meta-sheet-picker'),
    sheetName: document.getElementById('meta-sheet-name'),
    changeSheetButton: document.getElementById('meta-change-sheet'),
    specs: META_CRAWL_SPECS,
    onReset: () => {
      checked = null;
      resultBox.hidden = true;
    },
    onRows: (rows) => {
      const result = checkMetadata(rows);
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
      const blob = await buildMetaReport(checked);
      downloadBlob(blob, metaReportFileName(checked.pages[0].url));
    } catch (err) {
      intake.showError(`Could not build the report: ${err.message}`);
    } finally {
      downloadButton.disabled = false;
    }
  });

  function showDiagnosis({ pages, hasH1 }) {
    const total = pages.length;
    const toFix = pages.filter((page) => !page.titleOk || !page.descriptionOk);
    const titles = pages.filter((page) => !page.titleOk).length;
    const descriptions = pages.filter((page) => !page.descriptionOk).length;
    const manual = toFix.filter((page) => page.type === MANUAL_TYPE).length;
    site.textContent = siteName(pages[0].url);

    const sentences = [];
    if (toFix.length > 0) {
      setFinding(
        finding,
        toFix.length,
        `of ${total} ${plural(total, 'page', 'pages')} ${plural(toFix.length, 'needs', 'need')} a new title or description.`,
        { alert: true }
      );
      sentences.push(
        `Titles should have ${TITLE_RANGE.min}–${TITLE_RANGE.max} characters (${titles} ${plural(titles, 'doesn’t', 'don’t')}) and descriptions ${DESCRIPTION_RANGE.min}–${DESCRIPTION_RANGE.max} (${descriptions} ${plural(descriptions, 'doesn’t', 'don’t')}).`
      );
    } else {
      setFinding(finding, total, `${plural(total, 'page has', 'pages have')} a title and description of the right length.`);
    }

    if (hasH1) {
      const missing = pages.filter((page) => page.h1Issue === 'Missing').length;
      const several = pages.filter((page) => page.h1Issue === 'More than one H1').length;
      if (missing || several) {
        sentences.push(`${missing} ${plural(missing, 'page has', 'pages have')} no H1 and ${several} more than one.`);
      } else sentences.push('Every page has exactly one H1.');
    } else {
      sentences.push('The crawl has no H1 column, so H1s were not checked.');
    }

    if (manual > 0) {
      sentences.push(
        `${manual} of the pages to fix ${plural(manual, 'has', 'have')} no ID in the crawl, so ${plural(manual, 'it', 'they')} can’t go in the XML and must be updated by hand.`
      );
    }
    sentences.push(
      toFix.length > 0
        ? 'Download the report and send it to the market. They write the new texts in the DEC columns; grey cells are already fine.'
        : `You can still download the report${hasH1 ? ' for the H1 check' : ' for your records'}.`
    );
    advice.textContent = sentences.join(' ');
  }
})();
