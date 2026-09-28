// Page type rules: column mapping and validation. Pure functions, no DOM.

// Columns kept from the crawl, in report order. Any other crawl column is ignored.
// `aliases` are alternative header names used by other Screaming Frog extraction configs.
// Optional columns are only informative (not used by the rules) and are left empty if missing.
const COLUMN_SPECS = [
  { name: 'Address', required: true },
  { name: 'PLP ID 1', required: true },
  { name: 'PDP ID 1', required: true },
  { name: 'Content Asset 1', aliases: ['Content Asset ID 1'] },
  { name: 'Page Designer 1', aliases: ['Page Designer ID 1'] },
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

/**
 * Maps raw crawl rows (array of arrays, first matching row = headers) to records
 * keyed by COLUMNS. Screaming Frog sometimes prepends a title line, so the header
 * row is the first one containing "Address".
 * Returns { records, missing } where `missing` lists required headers not found.
 */
function mapCrawl(rows) {
  const required = COLUMN_SPECS.filter((spec) => spec.required).map((spec) => spec.name);
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalize(cell) === 'address'));
  if (headerIndex === -1) return { records: [], missing: required };

  const headers = rows[headerIndex].map(normalize);
  const positions = COLUMN_SPECS.map((spec) =>
    [spec.name, ...(spec.aliases ?? [])].map((name) => headers.indexOf(normalize(name))).find((i) => i !== -1) ?? -1
  );
  const missing = COLUMN_SPECS.filter((spec, i) => spec.required && positions[i] === -1).map((spec) => spec.name);
  if (missing.length) return { records: [], missing };

  const records = rows
    .slice(headerIndex + 1)
    .map((row) =>
      Object.fromEntries(COLUMNS.map((col, i) => [col, positions[i] === -1 ? '' : String(row[positions[i]] ?? '').trim()]))
    )
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
