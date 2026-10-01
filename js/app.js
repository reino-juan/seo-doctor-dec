// Shared UI helpers and the step tabs. Relies on Papa, ExcelJS and pagetype.js, loaded before it in index.html.

/**
 * Reads a .csv or .xlsx file into its non-empty sheets: [{ name, hidden, rows }],
 * where rows is an array of rows of strings. A CSV is a single sheet.
 */
async function readSheets(file) {
  if (/\.csv$/i.test(file.name)) {
    const rows = Papa.parse(await file.text(), { skipEmptyLines: true }).data;
    return rows.length ? [{ name: file.name, hidden: false, rows }] : [];
  }
  if (/\.xlsx$/i.test(file.name)) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    return workbook.worksheets
      .map((sheet) => {
        const rows = [];
        sheet.eachRow((row) => {
          const cells = [];
          for (let c = 1; c <= row.cellCount; c++) cells.push(row.getCell(c).text);
          rows.push(cells);
        });
        return { name: sheet.name, hidden: sheet.state !== 'visible', rows };
      })
      .filter((sheet) => sheet.rows.length > 0);
  }
  throw new Error('please upload a .csv or .xlsx file');
}

/**
 * Wires one upload area: file picker + drop zone, spinner, "New …" button, errors, and a sheet
 * chooser when a workbook has more than one sheet with data. `specs` (column specs) is used to
 * tell the user which sheets have the columns the step needs.
 * Calls onRows(rows) with the chosen sheet, and onReset() whenever the current result must go.
 * Returns { showError }.
 */
function createIntake({ input, dropzone, fileName, loading, clearButton, errorBox, picker, sheetName, changeSheetButton, specs, onRows, onReset }) {
  let sheets = [];
  let loadId = 0; // ignores a slow file that finishes after a newer one was chosen

  dropzone.addEventListener('click', () => input.click());
  enableDrop(dropzone, load);
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (file) load(file);
    input.value = ''; // allow re-uploading the same file
  });
  clearButton.addEventListener('click', reset);
  changeSheetButton.addEventListener('click', choose);

  function reset() {
    loadId++;
    sheets = [];
    fileName.textContent = '';
    loading.hidden = true;
    dropzone.disabled = false;
    clearButton.hidden = true;
    clearSheetState();
  }

  function clearSheetState() {
    picker.hidden = true;
    sheetName.textContent = '';
    changeSheetButton.hidden = true;
    errorBox.hidden = true;
    onReset();
  }

  async function load(file) {
    reset();
    const id = loadId;
    fileName.textContent = file.name;
    loading.hidden = false;
    dropzone.disabled = true;

    try {
      const result = await readSheets(file);
      if (id !== loadId) return;
      sheets = result;
    } catch (err) {
      if (id === loadId) showError(`Could not read the file: ${err.message}`);
      return;
    } finally {
      if (id === loadId) {
        loading.hidden = true;
        dropzone.disabled = false;
        clearButton.hidden = false;
      }
    }

    if (sheets.length === 0) showError('The file is empty.');
    else if (sheets.length === 1) use(sheets[0]);
    else choose();
  }

  function choose() {
    clearSheetState();
    const title = picker.querySelector('.sheet-picker-title');
    const options = picker.querySelector('.sheet-options');
    title.textContent = `This file has ${sheets.length} sheets with data. Choose the one to use.`;
    options.replaceChildren(...sheets.map((sheet) => sheetOption(sheet)));
    picker.hidden = false;
    // Focus the likely choice: a visible sheet with the needed columns.
    const likely = options.querySelector('.is-ready:not(.is-hidden)') ?? options.querySelector('.is-ready');
    (likely ?? options.firstElementChild).focus();
  }

  function sheetOption(sheet) {
    const { records, missing } = mapColumns(sheet.rows, specs);
    const ready = missing.length === 0;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sheet-option';
    button.classList.toggle('is-ready', ready);
    button.classList.toggle('is-hidden', sheet.hidden);

    const name = document.createElement('span');
    name.className = 'sheet-option-name';
    name.textContent = sheet.name;
    const note = document.createElement('span');
    note.className = 'sheet-option-note';
    note.textContent =
      (ready
        ? `${records.length} ${plural(records.length, 'row', 'rows')} with the needed columns.`
        : `Missing ${missing.join(', ')}.`) + (sheet.hidden ? ' Hidden in Excel.' : '');

    button.append(name, note);
    button.addEventListener('click', () => use(sheet));
    return button;
  }

  function use(sheet) {
    picker.hidden = true;
    if (sheets.length > 1) {
      sheetName.textContent = `Sheet: ${sheet.name}`;
      changeSheetButton.hidden = false;
    }
    try {
      onRows(sheet.rows);
    } catch (err) {
      showError(`Could not read the file: ${err.message}`);
    }
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  return { showError };
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

/**
 * Writes a finding sentence that starts with a count, e.g. "62 of 213 pages need a page type."
 * `alert` marks the count as something that needs fixing (carmine).
 */
function setFinding(el, count, rest, { alert = false } = {}) {
  const number = document.createElement('span');
  number.className = alert ? 'count count-alert' : 'count';
  number.textContent = count;
  el.replaceChildren(number, ` ${rest}`);
}

/** Lets a drop zone accept a dragged file; `onFile` receives the first file dropped. */
function enableDrop(zone, onFile) {
  zone.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (!zone.disabled) zone.classList.add('is-dragover');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
  zone.addEventListener('drop', (event) => {
    event.preventDefault();
    zone.classList.remove('is-dragover');
    const file = event.dataTransfer.files[0];
    if (file && !zone.disabled) onFile(file);
  });
}

// A file dropped outside a drop zone would make the browser open it and leave the app.
['dragover', 'drop'].forEach((type) => window.addEventListener(type, (event) => event.preventDefault()));

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
