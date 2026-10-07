// H1 Excel report. Relies on ExcelJS, metadata-report.js (addSheet, workbookBlob) and h1.js,
// loaded before it in index.html.

/** One "H1" sheet with the pages to fix; the market fills "H1 to implement". Returns a Blob. */
async function buildH1Report({ pages }) {
  const workbook = new ExcelJS.Workbook();
  const widths = [10, 24, 60, 18, 40, 40, 40];
  const sheet = addSheet(workbook, 'H1', H1_HEADERS.map((header, i) => [header, widths[i]]));
  pages
    .filter((page) => page.issue)
    .forEach((page) => sheet.addRow([page.type, page.id, page.url, page.issue, page.h1, page.h1Second, '']));
  return workbookBlob(workbook);
}
