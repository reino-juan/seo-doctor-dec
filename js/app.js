// Shared UI helpers and the step tabs. Relies on Papa and ExcelJS, loaded before it in index.html.

/** Reads a .csv or .xlsx (first sheet) file into an array of rows of strings. */
async function readRows(file) {
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    return Papa.parse(text, { skipEmptyLines: true }).data;
  }
  if (/\.xlsx$/i.test(file.name)) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const rows = [];
    workbook.worksheets[0].eachRow((row) => {
      const cells = [];
      for (let c = 1; c <= row.cellCount; c++) cells.push(row.getCell(c).text);
      rows.push(cells);
    });
    return rows;
  }
  throw new Error('please upload a .csv or .xlsx file');
}

/** plural(1, 'page', 'pages') -> 'page'; plural(2, ...) -> 'pages'. */
const plural = (count, one, many) => (count === 1 ? one : many);

function downloadBlob(blob, name) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Step tabs: each [data-step] tab shows the panel with id "step-<name>".
document.querySelectorAll('.step-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.step-tab').forEach((other) => {
      const selected = other === tab;
      other.setAttribute('aria-selected', String(selected));
      document.getElementById(`step-${other.dataset.step}`).hidden = !selected;
    });
  });
});
