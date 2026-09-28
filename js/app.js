// UI wiring for the Page Type tool. Relies on Papa, ExcelJS, pagetype.js and report.js, loaded before it in index.html.

const fileInput = document.getElementById('crawl-file');
const uploadButton = document.getElementById('upload-button');
const fileName = document.getElementById('file-name');
const errorBox = document.getElementById('upload-error');
const resultBox = document.getElementById('result');
const incorrectCount = document.getElementById('incorrect-count');
const totalCount = document.getElementById('total-count');
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
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = reportFileName(report.records[0]?.Address);
    link.click();
    URL.revokeObjectURL(link.href);
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
  clearButton.hidden = false;

  try {
    const rows = await readRows(file);
    const { records, missing } = mapCrawl(rows);
    if (missing.length) {
      return showError(`This is not a valid crawl. Missing column(s): ${missing.join(', ')}.`);
    }
    if (!records.length) return showError('The crawl does not contain any URL.');

    const statuses = validate(records);
    report = { records, statuses };
    incorrectCount.textContent = statuses.filter((s) => s !== 'OK').length;
    totalCount.textContent = records.length;
    resultBox.hidden = false;
  } catch (err) {
    showError(`Could not read the file: ${err.message}`);
  }
}

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

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}
