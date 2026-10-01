// Page type rules: column mapping and validation. Pure functions, no DOM.

// Columns kept from the crawl, in report order. Any other crawl column is ignored.
// Headers also match without a trailing "1" or the word "ID" (see headerKey), so "PLP ID 1",
// "PLP ID", "PLP 1" and "PLP" are the same column. `aliases` are for names that differ otherwise.
// Optional columns are only informative (not used by the rules) and are left empty if missing.
const COLUMN_SPECS = [
  { name: 'Address', required: true },
  { name: 'PLP ID 1', required: true },
  { name: 'PDP ID 1', required: true },
  { name: 'Content Asset 1' },
  { name: 'Page Designer 1' },
  { name: 'GEO Page Type 1', required: true },
];

const COLUMNS = COLUMN_SPECS.map((spec) => spec.name);

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

// Also strips a UTF-8 BOM, which Screaming Frog CSV exports start with.
const normalize = (value) => String(value ?? '').replace(/^﻿/, '').trim().toLowerCase();

// Loose header form: drops a trailing "1" and the word "ID", so markets' own naming still matches.
// "PLP ID 1" / "PLP ID" / "PLP 1" / "PLP" -> "plp"; "PLP ID 2" stays "plp 2" (a different column).
const headerKey = (value) =>
  normalize(value)
    .replace(/\s+1$/, '')
    .replace(/\bid\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Maps raw rows (array of arrays) to records keyed by the spec names.
 * Screaming Frog sometimes prepends a title line, so the header row is the first
 * one containing "Address"; rows without an Address are dropped.
 * Returns { records, missing } where `missing` lists required headers not found.
 */
function mapColumns(rows, specs) {
  const required = specs.filter((spec) => spec.required).map((spec) => spec.name);
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalize(cell) === 'address'));
  if (headerIndex === -1) return { records: [], missing: required };

  const headers = rows[headerIndex].map(normalize);
  const keys = headers.map(headerKey);
  // An exact header name wins; otherwise fall back to the looser headerKey match.
  const findColumn = (names) => {
    const exact = names.map((name) => headers.indexOf(normalize(name))).find((i) => i !== -1);
    if (exact !== undefined) return exact;
    const loose = names.map((name) => keys.indexOf(headerKey(name))).find((i) => i !== -1);
    return loose ?? -1;
  };
  const positions = specs.map((spec) => findColumn([spec.name, ...(spec.aliases ?? [])]));
  const missing = specs.filter((spec, i) => spec.required && positions[i] === -1).map((spec) => spec.name);
  if (missing.length) return { records: [], missing };

  const records = rows
    .slice(headerIndex + 1)
    .map((row) =>
      Object.fromEntries(specs.map((spec, i) => [spec.name, positions[i] === -1 ? '' : String(row[positions[i]] ?? '').trim()]))
    )
    .filter((record) => record.Address !== '');

  return { records, missing: [] };
}

const mapCrawl = (rows) => mapColumns(rows, COLUMN_SPECS);

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
  const domain = siteName(firstUrl);
  const name = domain ? domain.replace(/\./g, '_').toUpperCase() : 'Export';
  return `${name}_Page_Categorization.xlsx`;
}

/** https://www.lancome.es/maquillaje/ -> lancome.es ('' if there is no URL). */
function siteName(url) {
  return String(url ?? '')
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?/i, '')
    .split('/')[0]
    .toLowerCase();
}
