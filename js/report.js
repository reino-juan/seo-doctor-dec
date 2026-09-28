// Excel report generation. Relies on ExcelJS and pagetype.js, loaded before it in index.html.

const HEADER_FILL = 'FF1D2C3F'; // DEC logo navy
const STATUS_FILLS = { OK: 'FFD9EAD3', ERROR: 'FFF4CCCC' };
const COLUMN_WIDTHS = [60, 14, 14, 30, 30, 26, 30, 40];

/** Builds the MASTER workbook and returns it as a Blob. */
async function buildReport(records, statuses) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('MASTER', { views: [{ state: 'frozen', ySplit: 1 }] });

  const headers = [...COLUMNS, STATUS_HEADER, NOTES_HEADER];
  sheet.columns = headers.map((header, i) => ({ header, width: COLUMN_WIDTHS[i] }));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  });

  const dropdown = {
    type: 'list',
    allowBlank: true,
    formulae: [`"${ACCEPTED_PAGE_TYPES.join(',')}"`],
    showErrorMessage: true,
    errorTitle: 'Invalid page type',
    error: 'Please pick one of the accepted page types.',
  };

  records.forEach((record, i) => {
    const status = statuses[i];
    const row = sheet.addRow([...COLUMNS.map((col) => record[col]), status, '']);
    const statusCell = row.getCell(COLUMNS.length + 1);
    if (STATUS_FILLS[status]) {
      statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILLS[status] } };
    }
    if (status !== 'OK') statusCell.dataValidation = dropdown;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
