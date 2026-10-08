// 4xx & 5xx errors rules: turns a Screaming Frog "Bulk Export > Response Codes > … Inlinks" export
// into one row per broken link. Pure functions, no DOM. Relies on pagetype.js (mapColumns,
// siteName) and metadata.js (siteCode).

// Export columns kept (in report order, see ERRORS_COLUMNS). Everything else in the export is
// constant or noise for webmasters (Size, Crawlability, Follow, Target, Rel, Path Type…).
const ERRORS_SPECS = [
  { name: 'Source', required: true },
  { name: 'Destination', required: true },
  { name: 'Status Code', required: true },
  { name: 'Status' }, // only to recognise "No Response"
  { name: 'Type' },
  { name: 'Anchor' },
  { name: 'Alt Text' }, // shown as the anchor of image links
  { name: 'Link Path' },
  { name: 'Link Position' },
  { name: 'Link Origin' },
];

const ERRORS_COLUMNS = ['Source', 'Destination', 'Anchor', 'Status Code', 'Type', 'Link Path', 'Link Position', 'Link Origin', 'Note'];

// Page area of a link from its XPath, for exports without Link Position.
const TEMPLATE_AREAS = { header: 'Header', footer: 'Footer', nav: 'Navigation', aside: 'Sidebar' };

function templateArea(linkPath) {
  const tag = Object.keys(TEMPLATE_AREAS).find((name) => new RegExp(`/${name}(\\[|/|$)`, 'i').test(linkPath));
  return tag ? TEMPLATE_AREAS[tag] : '';
}

/**
 * A link that comes from the page template (header, footer, menu…) rather than the page content:
 * Screaming Frog's Link Position when present, otherwise the XPath.
 */
const isTemplateLink = (record) =>
  record['Link Position'] ? record['Link Position'] !== 'Content' : Boolean(templateArea(record['Link Path']));

const hostOf = (url) => siteName(url);

/**
 * Why a link is probably broken, and whether it should be checked by hand before anyone fixes it
 * (likely false positive). Returns { note, check }.
 */
function diagnose(record) {
  const destination = record.Destination;
  const code = Number(record['Status Code']) || 0;
  const external = hostOf(destination) !== hostOf(record.Source);

  if (/staging|[.-]stg[.-]|dw-sites\.com|demandware\.net/i.test(hostOf(destination))) {
    return { note: 'Link to a staging site', check: false };
  }
  if (/\$\{|\$%7B|\{\{|%7B%7B/i.test(destination)) return { note: 'Unrendered template code in the URL', check: false };
  if (/\/cdn-cgi\/l\/email-protection/i.test(destination)) {
    return { note: 'Cloudflare email protection: works in a browser, check it', check: true };
  }
  if (code === 0 || /no response/i.test(record.Status)) {
    return { note: 'No response: check again, it may be temporary', check: true };
  }
  if (!external && (code === 401 || code === 403)) {
    return { note: 'Access denied to the crawler: open it in a browser (bot protection or login page?)', check: true };
  }
  if (code >= 500) return { note: 'Server error: may be temporary, check again', check: false };
  if (external) return { note: 'External site', check: false };
  return { note: '', check: false };
}

/**
 * Groups the export into unique broken links:
 * - template links: one per destination + area (header, footer…), with the number of pages;
 * - content links: one per source + destination (repeated links on a page are merged).
 * Returns { links, toCheck, rows, missing } with links/toCheck as report rows (ERRORS_COLUMNS
 * keys plus `template` and `pages`), template links first (most pages first), then by destination.
 */
function groupErrors(rows) {
  const { records, missing } = mapColumns(rows, ERRORS_SPECS);
  if (missing.length) return { missing };

  const groups = new Map();
  for (const record of records) {
    const template = isTemplateLink(record);
    const area = record['Link Position'] || templateArea(record['Link Path']);
    const key = template
      ? `T ${record.Destination} ${area} ${templateArea(record['Link Path'])}`
      : `C ${record.Source} ${record.Destination}`;
    if (!groups.has(key)) groups.set(key, { template, records: [] });
    groups.get(key).records.push(record);
  }

  const result = [...groups.values()].map(({ template, records: group }) => {
    const first = group[0];
    const pages = new Set(group.map((record) => record.Source)).size;
    const anchor = group.map((record) => record.Anchor || record['Alt Text']).find(Boolean) ?? '';
    const paths = new Map();
    group.forEach((record) => paths.set(record['Link Path'], (paths.get(record['Link Path']) ?? 0) + 1));
    const linkPath = [...paths].sort((a, b) => b[1] - a[1])[0][0];
    const { note, check } = diagnose(first);
    const where = template
      ? `${templateArea(linkPath) || first['Link Position'] || 'Template'} link on ${pages} ${pages === 1 ? 'page' : 'pages'}: fix it once in the template`
      : '';
    return {
      template,
      pages,
      check,
      Source: first.Source,
      Destination: first.Destination,
      Anchor: anchor,
      'Status Code': first['Status Code'],
      Type: first.Type,
      'Link Path': linkPath,
      'Link Position': first['Link Position'],
      'Link Origin': first['Link Origin'],
      Note: [where, note].filter(Boolean).join('. '),
    };
  });

  const order = (a, b) =>
    b.template - a.template || b.pages - a.pages || a.Destination.localeCompare(b.Destination) || a.Source.localeCompare(b.Source);
  result.sort(order);
  return {
    links: result.filter((link) => !link.check),
    toCheck: result.filter((link) => link.check),
    rows: records.length,
    missing: [],
  };
}

/** KIEHLS_ES_4xx_5xx_errors.xlsx */
const errorsReportFileName = (firstUrl) => `${siteCode(firstUrl) || 'Export'}_4xx_5xx_errors.xlsx`;
