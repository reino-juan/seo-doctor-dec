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

// How to read the report: shown in the app ("How to read the report") and as the first sheet of
// the Excel file, so webmasters get the explanation with the list.
const ERRORS_GUIDE = [
  {
    title: 'Links to fix',
    items: [
      'Each broken link appears once.',
      'Columns: Source, Destination, Anchor, Status Code, Type, Link Path, Link Position, Link Origin, plus a Note. For images, the alt text goes in the Anchor column.',
      'Header, footer and menu links appear once, in bold, with a note like "Footer link on 789 pages: fix it once in the template". Fixing the template removes the error from every page.',
      'Content links appear once per page: if a page links to the same URL several times, that is one row.',
      'The Note also flags links to a staging site, template code left in the URL (e.g. …/${URLUtils.url…}), external sites and server errors (5xx, may be temporary).',
    ],
  },
  {
    title: 'To check',
    items: [
      'Likely false positives: open each Destination in a browser before changing anything.',
      'Cloudflare email protection links (/cdn-cgi/l/email-protection): they fail for the crawler but work in a browser.',
      '401/403 on the site itself: often the site blocking the crawler (bot protection) or a login page.',
      'Links that got no response: check again, it may have been temporary.',
      'If the page works in a browser, there is nothing to fix. If it is really broken, treat it like the links to fix: a header or footer link is the most important fix of all, since one change clears it on every page.',
    ],
  },
  {
    title: 'How to work through it',
    items: [
      'Start with the bold rows: one change in the template fixes them on every page.',
      'Then the content links: open the Source page and look for the Anchor text (or the image with that alt text). Change the link to a working URL or remove it.',
      'To find a link on the page, the Link Path is its exact position (XPath). The XPath locator, a bookmarklet in the Bookmarklets section of SEO DECtor, highlights on the page the element a Link Path points to: open the Source page, click the bookmarklet and paste the Link Path.',
    ],
  },
  {
    title: 'Columns',
    items: [
      'Source: the page that contains the broken link (for template links, one example page).',
      'Destination: the broken URL the link points to.',
      'Anchor: the clickable text of the link (the alt text for images).',
      'Status Code: the error the Destination returned (404 not found, 410 gone, 401/403 access denied, 5xx server error, 0 no response).',
      'Type: Hyperlink, Image, or HTTP Redirect (the Source redirects to the broken URL).',
      'Link Path: the XPath of the link in the page HTML.',
      'Link Position: where Screaming Frog found the link (Navigation, Header, Footer, Sidebar or Content).',
      'Link Origin: HTML (in the page source), Dynamic (added by JavaScript) or HTTP (a redirect).',
      'Note: why the link is probably broken, and how many pages a template link appears on.',
    ],
  },
];

/** One-sentence summary of a groupErrors result, e.g. for the Instructions sheet. */
function errorsSummary({ links, toCheck, rows }) {
  const template = links.filter((link) => link.template).length;
  const s = (n, one, many) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;
  return (
    `This export had ${s(rows, 'row', 'rows')}: ${s(links.length, 'link', 'links')} to fix ` +
    `(${s(template, 'template link', 'template links')}, ${links.length - template} in page content) ` +
    `and ${toCheck.length} to check.`
  );
}

/** KIEHLS_ES_4xx_5xx_errors.xlsx */
const errorsReportFileName = (firstUrl) => `${siteCode(firstUrl) || 'Export'}_4xx_5xx_errors.xlsx`;
