// Metadata Step 1 Excel report, plus the sheet helpers the H1 report reuses. Relies on ExcelJS,
// report.js (HEADER_FILL, STATUS_FILLS) and metadata.js, loaded before it in index.html.

const KEEP_FILL = 'FFEFEFEF'; // DEC cell for a title/description that is already fine

const solid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

function addSheet(workbook, name, columns) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map(([header, width]) => ({ header, width }));
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell((cell) => (cell.fill = solid(HEADER_FILL)));
  return sheet;
}

/** Green when the length column is within range, red when it is outside (empty cells stay white). */
function colourLengths(sheet, column, lastRow, { min, max }) {
  if (lastRow < 2) return;
  const first = `${column}2`;
  const fill = (argb) => ({ fill: { type: 'pattern', pattern: 'solid', bgColor: { argb } } });
  sheet.addConditionalFormatting({
    ref: `${first}:${column}${lastRow}`,
    rules: [
      { type: 'expression', priority: 1, formulae: [`AND(ISNUMBER(${first}),${first}>=${min},${first}<=${max})`], style: fill(STATUS_FILLS.OK) },
      { type: 'expression', priority: 2, formulae: [`AND(ISNUMBER(${first}),OR(${first}<${min},${first}>${max}))`], style: fill(STATUS_FILLS.ERROR) },
    ],
  });
}

/** Workbook -> .xlsx Blob. */
async function workbookBlob(workbook) {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Builds the workbook from checkMetadata's result: "Title + Description" with the pages to fix
 * (live length counters next to the DEC columns the market fills). Returns a Blob.
 */
async function buildMetaReport({ pages }) {
  const workbook = new ExcelJS.Workbook();
  workbook.calcProperties.fullCalcOnLoad = true; // the DEC length formulas

  const h = META_HEADERS;
  const metas = addSheet(workbook, 'Title + Description', [
    [h.type, 10], [h.id, 24], [h.url, 60],
    [h.title, 45], [h.length, 5], [h.description, 60], [h.length, 5],
    [h.decTitle, 45], [h.length, 5], [h.decDescription, 60], [h.length, 5],
  ]);
  const toFix = pages.filter((page) => !page.titleOk || !page.descriptionOk);
  toFix.forEach((page, i) => {
    const r = i + 2;
    const row = metas.addRow([
      page.type, page.id, page.url,
      page.title, textLength(page.title), page.description, textLength(page.description),
      '', { formula: `IF(H${r}="","",LEN(H${r}))` }, '', { formula: `IF(J${r}="","",LEN(J${r}))` },
    ]);
    if (page.titleOk) row.getCell(8).fill = solid(KEEP_FILL);
    if (page.descriptionOk) row.getCell(10).fill = solid(KEEP_FILL);
  });
  const last = toFix.length + 1;
  colourLengths(metas, 'E', last, TITLE_RANGE);
  colourLengths(metas, 'I', last, TITLE_RANGE);
  colourLengths(metas, 'G', last, DESCRIPTION_RANGE);
  colourLengths(metas, 'K', last, DESCRIPTION_RANGE);
  return workbookBlob(workbook);
}
