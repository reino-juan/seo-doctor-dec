// Metadata rules: crawl columns, page IDs, title/description checks (Step 1) and the
// SFCC catalog/library import XML (Step 2). Pure functions, no DOM. Relies on pagetype.js
// (mapColumns, headerKey, siteName) and xml.js (escapeAttr; XML_LOCALES is the locale list).

// Crawl columns. Loose header matching (headerKey in pagetype.js): "Title 1" = "Title",
// "PAGE DESIGNER ID 1" = "Page Designer"… Every other column is ignored.
const META_CRAWL_SPECS = [
  { name: 'Address', required: true },
  { name: 'Status Code' }, // when present, only status 200 pages are kept
  { name: 'PLP ID 1', required: true },
  { name: 'PDP ID 1', required: true },
  { name: 'Page Designer 1' },
  { name: 'Content Asset 1' },
  { name: 'Title 1', required: true },
  { name: 'Description 1', required: true, aliases: ['Meta Description 1'] },
];

// Lengths (characters) the team aims for; outside them, or empty, the page goes in the report.
const TITLE_RANGE = { min: 50, max: 60 };
const DESCRIPTION_RANGE = { min: 140, max: 155 };

// Report headers. Step 2 reads the DEC columns back (the note in brackets is ignored).
const META_HEADERS = {
  type: 'Type',
  id: 'ID',
  url: 'URL',
  title: 'Title - current',
  description: 'Meta description - current',
  decTitle: `DEC Title (${TITLE_RANGE.min}-${TITLE_RANGE.max} characters)`,
  decDescription: `DEC Description (${DESCRIPTION_RANGE.min}-${DESCRIPTION_RANGE.max} characters)`,
  length: 'L',
};

// Page types in the XML, in display order. `element` is the XML tag, `catalog` whether the file
// needs a catalog-id (content goes to the site library, which needs none).
const META_TYPES = [
  { type: 'product', one: 'product', many: 'products', element: 'product', catalog: true },
  { type: 'category', one: 'category', many: 'categories', element: 'category', catalog: true },
  { type: 'content', one: 'content page', many: 'content pages', element: 'content', catalog: false },
];

// Pages with no usable ID (none in the crawl, or a Content Asset ID with "%"): their metadata has
// to be changed by hand in Business Manager, so they are never written to the XML.
const MANUAL_TYPE = 'manual';

// URLs that are files or tracking, not pages (same filter as the legacy template).
const NOT_A_PAGE = ['.jpg', '.js', '.png', '.css', '.svg', '.pdf', '.gif', '?', 'cdn-cgi', 'demandware'];

const isPage = (record) =>
  (!record['Status Code'] || record['Status Code'] === '200') &&
  !NOT_A_PAGE.some((part) => record.Address.toLowerCase().includes(part));

/**
 * Type and ID of a crawled page, by priority: PLP -> category, PDP -> product,
 * Page Designer -> content, Content Asset -> content. No ID -> manual.
 */
function pageId(record) {
  if (record['PLP ID 1']) return { type: 'category', id: record['PLP ID 1'] };
  if (record['PDP ID 1']) return { type: 'product', id: record['PDP ID 1'] };
  if (record['Page Designer 1']) return { type: 'content', id: record['Page Designer 1'] };
  const asset = record['Content Asset 1'];
  if (asset && !asset.includes('%')) return { type: 'content', id: asset };
  return { type: MANUAL_TYPE, id: '' };
}

/** Length as people count it (an emoji is one character). */
const textLength = (text) => [...String(text ?? '')].length;
const inRange = (text, { min, max }) => textLength(text) >= min && textLength(text) <= max;

/**
 * Step 1: checks every page of the crawl.
 * Returns { pages, missing } where each page is
 * { type, id, url, title, description, titleOk, descriptionOk }. Non-pages (images, redirects…)
 * are dropped.
 */
function checkMetadata(rows) {
  const { records, missing } = mapColumns(rows, META_CRAWL_SPECS);
  if (missing.length) return { missing };

  const pages = records.filter(isPage).map((record) => ({
    ...pageId(record),
    url: record.Address,
    title: record['Title 1'],
    description: record['Description 1'],
    titleOk: inRange(record['Title 1'], TITLE_RANGE),
    descriptionOk: inRange(record['Description 1'], DESCRIPTION_RANGE),
  }));
  return { pages, missing: [] };
}

// ---------- Step 2: completed report -> XML ----------

// Columns read from the completed report. Type and ID come from the Step 1 report; files with
// only URLs (older country docs) need the crawl to find them. The aliases cover the legacy
// "Download back up Title + Description" sheet.
const META_XML_SPECS = [
  { name: 'URL', required: true, aliases: ['Address', 'URL (where to fix the issue)'] },
  { name: 'Type' },
  { name: 'ID' },
  { name: 'DEC Title', oneOf: 'DEC Title or DEC Description', aliases: ['Title to implement'] },
  { name: 'DEC Description', oneOf: 'DEC Title or DEC Description', aliases: ['Meta description to implement'] },
];

// What markets write to mean "keep the current one" (the legacy templates used both).
const KEEP_CURRENT = ['', '-', '****'];

// Line breaks and repeated spaces become one space; non-breaking spaces (French "95 %") stay.
const cleanText = (value) => {
  const text = String(value ?? '').replace(/[ \t\r\n]+/g, ' ').trim();
  return KEEP_CURRENT.includes(text) ? '' : text;
};

/**
 * Picks what goes into the XML. `crawlPages` (from checkMetadata, optional) gives the type and ID
 * of rows that have none. Rows with a title and/or description are grouped by type and ID;
 * repeated IDs are merged when they agree and left out when they don't.
 * Returns { byType: { product: [{ id, title, description }], … }, skipped: [{ url, type, id, reason }],
 * needCrawl } where needCrawl counts rows left out only because they had no ID and no crawl was given.
 */
function buildMetaEntries(records, crawlPages) {
  const crawlById = new Map((crawlPages ?? []).map((page) => [page.url, page]));
  const skipped = [];
  const groups = new Map(); // "type id" -> rows
  let needCrawl = 0;

  for (const record of records) {
    const title = cleanText(record['DEC Title']);
    const description = cleanText(record['DEC Description']);
    if (!title && !description) continue;

    let type = normalize(record.Type);
    let id = record.ID;
    if (!type || (type !== MANUAL_TYPE && !id)) {
      const page = crawlById.get(record.URL);
      if (page) ({ type, id } = page);
      else {
        if (!crawlPages) needCrawl++;
        skipped.push({ url: record.URL, type: '', id: '', reason: crawlPages ? 'Not in the crawl' : 'No type or ID: add the crawl' });
        continue;
      }
    }
    if (type === MANUAL_TYPE) {
      skipped.push({ url: record.URL, type, id: '', reason: 'No ID: update it by hand in Business Manager' });
      continue;
    }
    if (!META_TYPES.some((t) => t.type === type)) {
      skipped.push({ url: record.URL, type: record.Type, id, reason: 'Unknown type' });
      continue;
    }
    const key = `${type} ${id}`;
    groups.set(key, [...(groups.get(key) ?? []), { url: record.URL, type, id, title, description }]);
  }

  const byType = Object.fromEntries(META_TYPES.map((t) => [t.type, []]));
  for (const rows of groups.values()) {
    const differs = (field) => new Set(rows.map((row) => row[field]).filter(Boolean)).size > 1;
    if (differs('title') || differs('description')) {
      rows.forEach((row) => skipped.push({ url: row.url, type: row.type, id: row.id, reason: 'Same ID with a different title or description' }));
      continue;
    }
    const { type, id } = rows[0];
    byType[type].push({
      id,
      title: rows.find((row) => row.title)?.title ?? '',
      description: rows.find((row) => row.description)?.description ?? '',
    });
  }
  return { byType, skipped, needCrawl };
}

/**
 * Text for the XML: escapes & < >, writes every non-ASCII character as a numeric reference
 * (é -> &#233;, as the legacy template did) and fixes Word's curly quotes and dashes.
 */
function encodeMetaText(text) {
  return String(text)
    .replace(/_x009[12]_/g, "'") // Word apostrophe as escaped by some Excel exports
    .replace(/[\u0091\u0092‘’]/g, "'")
    .replace(/–/g, '-')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/[^\u0000-\u007F]/gu, (char) => `&#${char.codePointAt(0)};`);
}

/**
 * Builds the import XML for one type: a catalog (products, categories) or the library (content).
 * Each text is written once per locale (titles first, then descriptions).
 */
function buildMetaXml(type, entries, { locales, catalog }) {
  const { element } = META_TYPES.find((t) => t.type === type);
  const langs = locales.map(escapeAttr);
  const blocks = entries.map(({ id, title, description }) => {
    const lines = [`<${element} ${element}-id="${escapeAttr(id)}">`, '\t<page-attributes>'];
    if (title) langs.forEach((lang) => lines.push(`\t\t<page-title xml:lang="${lang}">${encodeMetaText(title)}</page-title>`));
    if (description) {
      langs.forEach((lang) => lines.push(`\t\t<page-description xml:lang="${lang}">${encodeMetaText(description)}</page-description>`));
    }
    lines.push('\t</page-attributes>', `</${element}>`);
    return lines.join('\n');
  });

  const root =
    type === 'content'
      ? ['<library xmlns="http://www.demandware.com/xml/impex/library/2006-10-31">', '</library>']
      : [`<catalog xmlns="http://www.demandware.com/xml/impex/catalog/2006-10-31" catalog-id="${escapeAttr(catalog)}">`, '</catalog>'];

  return ['<?xml version="1.0" encoding="UTF-8"?>', root[0], ...blocks, root[1], ''].join('\n');
}

/** https://www.yslbeauty.fr/… -> YSLBEAUTY_FR ('' without a URL). */
const siteCode = (url) => siteName(url).replace(/\./g, '_').toUpperCase();

/** YSLBEAUTY_FR_Metadata.xlsx */
const metaReportFileName = (firstUrl) => `${siteCode(firstUrl) || 'Export'}_Metadata.xlsx`;

/**
 * DEC_20261007_YSLBEAUTY_FR_SEO_product_fr-FR.xml (legacy pattern). Up to three locales are
 * listed (fr-BE_nl-BE); more become "5-locales".
 */
function metaXmlFileName(firstUrl, type, locales, date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const langs = locales.length <= 3 ? locales.join('_') : `${locales.length}-locales`;
  return `DEC_${day}_${siteCode(firstUrl) || 'SITE'}_SEO_${type}_${langs}.xml`;
}

// SFCC catalogs offered by default (from the legacy template). Users can add or remove catalogs
// in the app; their list is kept in the browser (see step-meta-xml.js).
const DEFAULT_CATALOGS = [
  'bau-master-catalog', 'bio-de-navigation', 'bio-es-navigation', 'bio-master-catalog',
  'car-emea-west-navigation-ng', 'car-master-catalog', 'fff-master-catalog', 'fnf-es-master-catalog',
  'fnf-gb-master-catalog', 'gac-emea-west-navigation', 'gac-master-catalog', 'hru-emea-west-navigation',
  'hru-master-catalog', 'itc-de-navigation-ng', 'itc-master-catalog', 'itcosmetics-master-catalog',
  'ker-emea-west-ng-navigation', 'ker-master-catalog', 'ker-uk-navigation-ng', 'kerastase-master-catalog',
  'kie-emea-west-navigation-ng', 'kie-master-catalog', 'kie-ng-de-navigation', 'kie-ng-east-navigation',
  'kie-ng-es-navigation', 'kie-ng-fr-navigation', 'kie-ng-it-navigation', 'kie-ng-uk-navigation',
  'lac-de-ng-navigation', 'lac-emea-west-ng-navigation', 'lac-es-ng-navigation', 'lac-fr-ng-navigation',
  'lac-it-ng-navigation', 'lac-master-catalog', 'lac-ng-east-navigation', 'lac-uk-ng-navigation',
  'lora-master-ng', 'lora-navigation', 'lrp-master-catalog', 'lrp-ng-fr-navigation', 'lrp-ng-ie-navigation',
  'lrp-ng-master-catalog', 'lrp-ng-uk-navigation', 'mdc-master-catalog', 'mug-fr-navigation',
  'mug-master-catalog', 'mug-uk-navigation', 'nyx-emea-west-ng-navigation', 'nyx-es-ng-navigation',
  'nyx-fr-ng-navigation', 'nyx-it-navigation-ng', 'nyx-master-catalog', 'nyx-uk-navigation-ng',
  'san-master-catalog', 'skc-ch-navigation-ng', 'skc-de-navigation-ng', 'skc-es-navigation-ng',
  'skc-fr-navigation-ng', 'skc-it-navigation-ng', 'skc-master-catalog', 'skc-nl-navigation-ng',
  'skc-nordics-navigation-ng', 'skc-uk-navigation', 'ssu-master-catalog', 'ssu-navigation-catalog',
  'staffshop-fr-master-catalog', 'stf-master-catalog', 'stf-pl-master-catalog', 'sza-master-catalog',
  'udc-emea-west-ng-navigation', 'udc-master-catalog', 'val-master-catalog',
  'valentino-emea-west-ng-navigation', 'vic-master-catalog', 'vic-ng-uk-navigation',
  'ysl-emea-west-navigation', 'ysl-emea-west-navigation-ng', 'ysl-fr-navigation-ng', 'ysl-master-catalog',
  'ytp-master-catalog', 'yttp-ukie-navigation',
];

/**
 * All catalogs, the ones that fit the type first: products usually live in a master catalog,
 * categories in a navigation catalog. Nothing is hidden, since naming isn't always consistent.
 */
function catalogsFor(type, catalogs) {
  const kind = (name) => (/navigation/i.test(name) ? 'category' : /master/i.test(name) ? 'product' : '');
  const fits = (name) => !kind(name) || kind(name) === type;
  return [...catalogs.filter(fits), ...catalogs.filter((name) => !fits(name))];
}
