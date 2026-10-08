// 4xx & 5xx errors Excel report. Relies on ExcelJS, metadata-report.js (addSheet, workbookBlob)
// and errors.js, loaded before it in index.html.

const ERRORS_WIDTHS = { Source: 50, Destination: 60, Anchor: 30, 'Status Code': 11, Type: 12, 'Link Path': 50, 'Link Position': 13, 'Link Origin': 11, Note: 60 };

/** The guide (ERRORS_GUIDE) as a sheet: title, summary of this export, then each section. */
function addInstructions(workbook, grouped) {
  const sheet = workbook.addWorksheet('Instructions');
  sheet.getColumn(1).width = 120;
  const add = (text, font = {}) => {
    const row = sheet.addRow([text]);
    row.font = font;
    row.alignment = { wrapText: true, vertical: 'top' };
  };
  add('4xx & 5xx errors: how to use this file', { bold: true, size: 14 });
  add(errorsSummary(grouped));
  ERRORS_GUIDE.forEach(({ title, items }) => {
    add('');
    add(title, { bold: true, size: 12 });
    items.forEach((item) => add(`•  ${item}`));
  });
}

/**
 * "Instructions", "Links to fix" and, when there are any, "To check" (likely false positives).
 * Returns a Blob.
 */
async function buildErrorsReport(grouped) {
  const { links, toCheck } = grouped;
  const workbook = new ExcelJS.Workbook();
  addInstructions(workbook, grouped);
  const sheets = [['Links to fix', links], ['To check', toCheck]];
  sheets.forEach(([name, rows], i) => {
    if (i > 0 && rows.length === 0) return;
    const sheet = addSheet(workbook, name, ERRORS_COLUMNS.map((column) => [column, ERRORS_WIDTHS[column]]));
    rows.forEach((row) => {
      const added = sheet.addRow(ERRORS_COLUMNS.map((column) => (column === 'Status Code' ? Number(row[column]) || row[column] : row[column])));
      if (row.template) added.font = { bold: true }; // one fix in the template solves many pages
    });
  });
  return workbookBlob(workbook);
}
