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

// Report sheets with links, by who fixes them and how (user decision 2026-10-14). The order is the
// order of the workbook, after "Instructions" and "Broken URLs".
const ERRORS_SHEETS = [
  { key: 'template', name: 'Template', what: 'in the header, footer or menu' },
  { key: 'internal', name: 'Internal', what: 'to pages of the site' },
  { key: 'external', name: 'External', what: 'to other sites' },
  { key: 'check', name: 'To check', what: 'likely false positives' },
];

// A broken URL of the site linked from at least this many pages: suggest one redirect instead of
// editing every page.
const REDIRECT_FROM_PAGES = 5;

// "Broken URLs" sheet: one row per broken Destination.
const BROKEN_URL_COLUMNS = ['Destination', 'Status Code', 'Pages linking', 'Where', 'Suggestion'];

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

const isStaging = (url) => /staging|[.-]stg[.-]|dw-sites\.com|demandware\.net/i.test(hostOf(url));

/**
 * Why a link is probably broken, whether it should be checked by hand before anyone fixes it
 * (likely false positive), and whether it points to another site (staging counts as the site
 * itself: the fix is to use the live URL). Returns { note, check, external, cause }.
 */
function diagnose(record) {
  const result = diagnoseLink(record);
  const external = hostOf(record.Destination) !== hostOf(record.Source) && !isStaging(record.Destination);
  return { ...result, external };
}

function diagnoseLink(record) {
  const destination = record.Destination;
  const code = Number(record['Status Code']) || 0;
  const external = hostOf(destination) !== hostOf(record.Source);

  if (isStaging(destination)) return { note: 'Link to a staging site', check: false, cause: 'staging' };
  // ${…}, {{…}} or SFCC's $url(…)$ / URLUtils left in the link: the component that builds it is broken.
  if (/\$\{|\$%7B|\{\{|%7B%7B|\$url\(|\$url%28|URLUtils/i.test(destination)) {
    return { note: 'Unrendered template code in the URL', check: false, cause: 'code' };
  }
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
 * Each link gets `sheet` (a key of ERRORS_SHEETS). Returns { links, toCheck, brokenUrls, rows,
 * missing }: links/toCheck are report rows (ERRORS_COLUMNS keys plus `template`, `pages`, `sheet`),
 * template links first (most pages first), then by destination; brokenUrls (see brokenUrlRows)
 * covers the links to fix.
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
    const { note, check, external, cause } = diagnose(first);
    const where = template
      ? `${templateArea(linkPath) || first['Link Position'] || 'Template'} link on ${pages} ${pages === 1 ? 'page' : 'pages'}: fix it once in the template`
      : '';
    return {
      template,
      pages,
      check,
      cause,
      sheet: check ? 'check' : template ? 'template' : external ? 'external' : 'internal',
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

  const links = result.filter((link) => !link.check);
  const pagesLinking = new Map(); // destination -> sources
  records.forEach((record) => pagesLinking.set(record.Destination, (pagesLinking.get(record.Destination) ?? new Set()).add(record.Source)));
  return {
    links,
    toCheck: result.filter((link) => link.check),
    brokenUrls: brokenUrlRows(links, pagesLinking),
    rows: records.length,
    missing: [],
  };
}

/**
 * One row per broken URL among the links to fix (BROKEN_URL_COLUMNS keys plus `redirect`), most
 * linked first. A page of the site that is gone and linked from many pages is best fixed with
 * one 301 redirect.
 */
function brokenUrlRows(links, pagesLinking) {
  const byDestination = new Map();
  links.forEach((link) => byDestination.set(link.Destination, [...(byDestination.get(link.Destination) ?? []), link]));

  return [...byDestination]
    .map(([destination, group]) => {
      const first = group[0];
      const pages = pagesLinking.get(destination).size;
      const sheets = new Set(group.map((link) => link.sheet));
      const where = ERRORS_SHEETS.filter((s) => sheets.has(s.key)).map((s) => s.name).join(' + ');
      const gone = ['404', '410'].includes(first['Status Code']);
      const redirect = sheets.has('internal') && !sheets.has('template') && gone && !first.cause && pages >= REDIRECT_FROM_PAGES;
      const onPages = `${pages} ${pages === 1 ? 'page' : 'pages'}`;
      let suggestion;
      if (first.cause === 'staging') suggestion = 'Staging URL: change the links to the live URL';
      else if (first.cause === 'code') suggestion = 'Template code in the URL: fix the component that builds the link';
      else if (sheets.has('template')) suggestion = 'In the header, footer or menu: fix it once in the template';
      else if (redirect) suggestion = `Linked from ${onPages}: one 301 redirect to the right page fixes them all`;
      else if (sheets.has('external')) suggestion = `External site: update or remove the link on ${onPages}`;
      else suggestion = `Fix or remove the link on ${onPages} (or redirect the URL)`;
      return { redirect, Destination: destination, 'Status Code': first['Status Code'], 'Pages linking': pages, Where: where, Suggestion: suggestion };
    })
    .sort((a, b) => b['Pages linking'] - a['Pages linking'] || a.Destination.localeCompare(b.Destination));
}

// How to read the report: shown in the app ("How to read the report") and as the first sheet of
// the Excel file, so webmasters get the explanation with the list.
const ERRORS_GUIDE = [
  {
    title: 'The sheets',
    items: [
      'Broken URLs: one row per broken URL, with how many pages link to it and what to do. Start here: a page of the site linked from many pages is fixed with one 301 redirect instead of editing every page.',
      'Template: broken links in the header, footer or menu, for the development team. Each appears once, with a note like "Footer link on 789 pages: fix it once in the template".',
      'Internal: broken links to pages of the site, for the content team. One row per page and link (repeats on the same page are merged), sorted by broken URL.',
      'External: broken links to other sites. Update them to a working URL or remove them.',
      'To check: likely false positives. Open them in a browser before changing anything (see below).',
      'The Note column also flags links to a staging site, template code left in the URL (e.g. $url(…)$ or ${URLUtils…}) and server errors (5xx, may be temporary). For images, the alt text goes in the Anchor column.',
    ],
  },
  {
    title: 'To check',
    items: [
      'Cloudflare email protection links (/cdn-cgi/l/email-protection): they fail for the crawler but work in a browser.',
      '401/403 on the site itself: often the site blocking the crawler (bot protection) or a login page.',
      'Links that got no response: check again, it may have been temporary.',
      'If the page works in a browser, there is nothing to fix. If it is really broken, treat it like the other links: a header or footer link is the most important fix of all, since one change clears it on every page.',
    ],
  },
  {
    title: 'How to work through it',
    items: [
      `1. Broken URLs: add a 301 redirect for the URLs linked from ${REDIRECT_FROM_PAGES} or more pages, which clears their rows in Internal.`,
      '2. Template: one change in the header, footer or menu fixes the link on every page.',
      '3. Internal and External: open the Source page and look for the Anchor text (or the image with that alt text). Change the link to a working URL or remove it.',
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
      'Broken URLs sheet: Pages linking (how many pages link to it), Where (the sheets its links are in) and Suggestion.',
    ],
  },
];

/** One-sentence summary of a groupErrors result, e.g. for the Instructions sheet. */
function errorsSummary({ links, toCheck, brokenUrls, rows }) {
  const s = (n, one, many) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;
  const bySheet = ERRORS_SHEETS.filter((sheet) => sheet.key !== 'check').map(
    (sheet) => `${links.filter((link) => link.sheet === sheet.key).length} ${sheet.name.toLowerCase()}`
  );
  const redirects = brokenUrls.filter((url) => url.redirect).length;
  return (
    `This export had ${s(rows, 'row', 'rows')}: ${s(links.length, 'link', 'links')} to fix (${bySheet.join(', ')}) ` +
    `to ${s(brokenUrls.length, 'broken URL', 'broken URLs')}, and ${toCheck.length} to check.` +
    (redirects > 0
      ? ` ${s(redirects, 'broken URL is', 'broken URLs are')} linked from ${REDIRECT_FROM_PAGES} or more pages: a redirect fixes each at once.`
      : '')
  );
}

/** KIEHLS_ES_4xx_5xx_errors.xlsx */
const errorsReportFileName = (firstUrl) => `${siteCode(firstUrl) || 'Export'}_4xx_5xx_errors.xlsx`;
