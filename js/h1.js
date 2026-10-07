// H1 rules: finds pages with no H1 or with more than one. Pure functions, no DOM.
// Relies on pagetype.js (mapColumns, siteName) and metadata.js (isPage, pageId, siteCode).

// Crawl columns. The ID columns are optional here: they only fill Type and ID in the report.
const H1_CRAWL_SPECS = [
  { name: 'Address', required: true },
  { name: 'Status Code' }, // when present, only status 200 pages are kept
  { name: 'PLP ID 1' },
  { name: 'PDP ID 1' },
  { name: 'Page Designer 1' },
  { name: 'Content Asset 1' },
  { name: 'H1 1', required: true, aliases: ['H1-1'] },
  { name: 'H1 2', aliases: ['H1-2'] }, // without it, only missing H1s are found
];

const H1_ISSUES = { missing: 'Missing', several: 'More than one H1' };

const H1_HEADERS = ['Type', 'ID', 'URL', 'Issue', 'H1 - current', 'Second H1', 'H1 to implement'];

/**
 * Checks every page of the crawl (same page filter as Metadata).
 * Returns { pages, missing } where each page is { type, id, url, h1, h1Second, issue }
 * (issue: '' or one of H1_ISSUES).
 */
function checkH1(rows) {
  const { records, missing } = mapColumns(rows, H1_CRAWL_SPECS);
  if (missing.length) return { missing };

  const pages = records.filter(isPage).map((record) => {
    const h1 = record['H1 1'];
    const h1Second = record['H1 2'];
    const issue = !h1 ? H1_ISSUES.missing : h1Second ? H1_ISSUES.several : '';
    return { ...pageId(record), url: record.Address, h1, h1Second, issue };
  });
  return { pages, missing: [] };
}

/** YSLBEAUTY_FR_H1.xlsx (the legacy generator's "_H1" file). */
const h1ReportFileName = (firstUrl) => `${siteCode(firstUrl) || 'Export'}_H1.xlsx`;
