// Page type rules: column mapping and validation. Pure functions, no DOM.

const COLUMNS = [
  'Address',
  'PLP ID 1',
  'PDP ID 1',
  'Content Asset 1',
  'Page Designer 1',
  'GEO Page Type 1',
];

const STATUS_HEADER = 'GEO Page Type to Implement';
const NOTES_HEADER = 'Notes';

// The "Master Key": accepted dataLayer values per bucket.
const ACCEPTED_PAGE_TYPES = [
  'homepage',
  'product selector page',
  'product detail page',
  'content page::article',
  'content page::branding page',
  'content page::service',
  'service::guide',
];

const normalize = (value) => String(value ?? '').trim().toLowerCase();

/**
 * Maps raw crawl rows (array of arrays, first matching row = headers) to records
 * keyed by COLUMNS. Screaming Frog sometimes prepends a title line, so the header
 * row is the first one containing "Address".
 * Returns { records, missing } where `missing` lists required headers not found.
 */
function mapCrawl(rows) {
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalize(cell) === 'address'));
  if (headerIndex === -1) return { records: [], missing: [...COLUMNS] };

  const headers = rows[headerIndex].map(normalize);
  const positions = COLUMNS.map((col) => headers.indexOf(normalize(col)));
  const missing = COLUMNS.filter((_, i) => positions[i] === -1);
  if (missing.length) return { records: [], missing };

  const records = rows
    .slice(headerIndex + 1)
    .map((row) => Object.fromEntries(COLUMNS.map((col, i) => [col, String(row[positions[i]] ?? '').trim()])))
    .filter((record) => record.Address !== '');

  return { records, missing: [] };
}

/**
 * Returns the status for each record: 'OK', 'ERROR' or '' (incorrect, to be filled by the market).
 */
function validate(records) {
  const homepageCount = records.filter((r) => normalize(r['GEO Page Type 1']) === 'homepage').length;

  return records.map((record) => {
    const pageType = normalize(record['GEO Page Type 1']);
    switch (pageType) {
      case 'homepage':
        return homepageCount === 1 ? 'OK' : 'ERROR';
      case 'product selector page':
        return record['PLP ID 1'] ? 'OK' : '';
      case 'product detail page':
        return record['PDP ID 1'] ? 'OK' : '';
      default:
        return ACCEPTED_PAGE_TYPES.includes(pageType) ? 'OK' : '';
    }
  });
}

/**
 * https://www.skinceuticals.nl/ -> SKINCEUTICALS_NL_Page_Categorization.xlsx
 */
function reportFileName(firstUrl) {
  const domain = String(firstUrl ?? '')
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?/i, '')
    .split('/')[0];
  const name = domain ? domain.replace(/\./g, '_').toUpperCase() : 'Export';
  return `${name}_Page_Categorization.xlsx`;
}
