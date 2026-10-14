// 4xx & 5xx errors UI: upload a Screaming Frog inlinks export, group it into unique broken links,
// download the report. Relies on errors.js, errors-report.js and app.js, loaded before it.
(() => {
  const resultBox = document.getElementById('errors-result');
  const site = document.getElementById('errors-site');
  const finding = document.getElementById('errors-finding');
  const advice = document.getElementById('errors-advice');
  const downloadButton = document.getElementById('errors-download-button');

  let grouped = null; // groupErrors result

  // "How to read the report": the same guide as the report's Instructions sheet.
  document.getElementById('errors-guide').replaceChildren(
    ...ERRORS_GUIDE.flatMap(({ title, items }) => {
      const heading = document.createElement('h3');
      heading.className = 'guide-title';
      heading.textContent = title;
      const list = document.createElement('ul');
      list.append(
        ...items.map((item) => {
          const li = document.createElement('li');
          li.textContent = item;
          return li;
        })
      );
      return [heading, list];
    })
  );

  const intake = createIntake({
    input: document.getElementById('errors-file'),
    dropzone: document.getElementById('errors-upload-button'),
    fileName: document.getElementById('errors-file-name'),
    loading: document.getElementById('errors-loading'),
    clearButton: document.getElementById('errors-clear-button'),
    errorBox: document.getElementById('errors-upload-error'),
    picker: document.getElementById('errors-sheet-picker'),
    sheetName: document.getElementById('errors-sheet-name'),
    changeSheetButton: document.getElementById('errors-change-sheet'),
    specs: ERRORS_SPECS,
    onReset: () => {
      grouped = null;
      resultBox.hidden = true;
    },
    onRows: (rows) => {
      const result = groupErrors(rows);
      if (result.missing.length) {
        return intake.showError(`This is not a Screaming Frog inlinks export. Missing column(s): ${result.missing.join(', ')}.`);
      }
      if (!result.rows) return intake.showError('The export does not contain any link.');

      grouped = result;
      showDiagnosis(result);
      resultBox.hidden = false;
    },
  });

  downloadButton.addEventListener('click', async () => {
    if (!grouped) return;
    downloadButton.disabled = true;
    try {
      const blob = await buildErrorsReport(grouped);
      downloadBlob(blob, errorsReportFileName(grouped.links[0]?.Source ?? grouped.toCheck[0]?.Source));
    } catch (err) {
      intake.showError(`Could not build the report: ${err.message}`);
    } finally {
      downloadButton.disabled = false;
    }
  });

  function showDiagnosis({ links, toCheck, brokenUrls, rows }) {
    const count = links.length;
    const inSheet = (key) => links.filter((link) => link.sheet === key).length;
    const redirects = brokenUrls.filter((url) => url.redirect).length;
    site.textContent = siteName((links[0] ?? toCheck[0])?.Source);
    const rowsText = `${rows.toLocaleString('en')} ${plural(rows, 'row', 'rows')}`;

    const sentences = [];
    if (count > 0) {
      // Only one number in the serif finding: its old-style figures make "4,149" read like "1,149".
      setFinding(finding, count, `broken ${plural(count, 'link', 'links')} to fix.`, { alert: true });
      const parts = ERRORS_SHEETS.filter(({ key }) => key !== 'check' && inSheet(key) > 0).map(
        ({ key, what }) => `${inSheet(key)} ${what}`
      );
      const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
      sentences.push(`From ${rowsText} in the export: ${list}, each in its own sheet.`);
      if (redirects > 0) {
        sentences.push(
          `${redirects} broken ${plural(redirects, 'URL is', 'URLs are')} linked from ${REDIRECT_FROM_PAGES} or more pages: one redirect fixes each at once (Broken URLs sheet).`
        );
      }
    } else {
      finding.textContent = 'No broken links to fix.';
      sentences.push(`Checked ${rowsText} in the export.`);
    }
    if (toCheck.length > 0) {
      sentences.push(
        `${toCheck.length} more ${plural(toCheck.length, 'link looks', 'links look')} like ${plural(toCheck.length, 'a false positive', 'false positives')} (blocked for the crawler, Cloudflare email protection…): ${plural(toCheck.length, 'it is', 'they are')} in the To check sheet, to open in a browser first.`
      );
    }
    sentences.push('Download the report and send it to the webmasters.');
    advice.textContent = sentences.join(' ');
  }
})();
