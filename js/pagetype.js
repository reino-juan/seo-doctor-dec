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

// Loose header form: drops a note in brackets, a trailing "1" and the word "ID", so markets' own
// naming still matches. "PLP ID 1" / "PLP ID" / "PLP 1" / "PLP" -> "plp"; "PLP ID 2" stays "plp 2"
// (a different column); "DEC Title (50-60 characters)" -> "dec title".
const headerKey = (value) =>
  normalize(value)
    .replace(/\(.*?\)/g, ' ')
    .trim()
    .replace(/\s+1$/, '')
    .replace(/\bid\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Maps raw rows (array of arrays) to records keyed by the spec names.
 * The header row is the first one containing the first spec's column (Screaming Frog sometimes
 * prepends a title line); rows where that first column is empty are dropped.
 * A spec with `oneOf: 'label'` is optional on its own, but at least one spec sharing that label
 * must be present.
 * Returns { records, missing } where `missing` lists required headers (or oneOf labels) not found.
 */
function mapColumns(rows, specs) {
  const key = specs[0].name;
  const required = [...new Set(specs.filter((spec) => spec.required || spec.oneOf).map((spec) => spec.oneOf ?? spec.name))];
  const keyNames = [key, ...(specs[0].aliases ?? [])];
  const isKeyHeader = (cell) => keyNames.some((name) => normalize(cell) === normalize(name) || headerKey(cell) === headerKey(name));
  const headerIndex = rows.findIndex((row) => row.some(isKeyHeader));
  if (headerIndex === -1) return { records: [], missing: required };

  const headers = rows[headerIndex].map(normalize);
  const keys = headers.map(headerKey);
  // An exact header name wins; otherwise fall back to the looser headerKey match.
  const findColumn = (names) => {
    const exact = names.map((name) => headers.indexOf(normalize(name))).find((i) => i !== -1);
    if (exact !== undefined) return exact;
    // ("ID" has an empty loose form, which would match any blank header.)
    const loose = names.map((name) => (headerKey(name) ? keys.indexOf(headerKey(name)) : -1)).find((i) => i !== -1);
    return loose ?? -1;
  };
  const positions = specs.map((spec) => findColumn([spec.name, ...(spec.aliases ?? [])]));
  const found = (spec, i) => positions[i] !== -1;
  const missing = [
    ...specs.filter((spec, i) => spec.required && !found(spec, i)).map((spec) => spec.name),
    ...[...new Set(specs.filter((spec) => spec.oneOf).map((spec) => spec.oneOf))].filter(
      (label) => !specs.some((spec, i) => spec.oneOf === label && found(spec, i))
    ),
  ];
  if (missing.length) return { records: [], missing };

  const records = rows
    .slice(headerIndex + 1)
    .map((row) =>
      Object.fromEntries(specs.map((spec, i) => [spec.name, positions[i] === -1 ? '' : String(row[positions[i]] ?? '').trim()]))
    )
    .filter((record) => record[key] !== '');

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
