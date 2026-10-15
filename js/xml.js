// Step 2: turn the report completed by a market into a Salesforce Commerce Cloud
// library import XML. Pure functions, no DOM. Relies on pagetype.js.
// Page Designer pages get the page type in their <data> JSON; content assets in the
// "analyticsPageCategory" key of their jsonData custom attribute, merged with what the library
// already has (see buildAssetUpdates).

// Columns read from the completed report. Loose header matching (headerKey in pagetype.js)
// covers the Step 1 export, the legacy "PageType update XML in bulk" template and market files.
const XML_COLUMN_SPECS = [
  { name: 'Address', required: true },
  // Also match "Page Designer 1", "PAGE DESIGNER", "Content Asset 1", "CONTENT ASSET ID 1"…
  { name: 'Page Designer ID', oneOf: 'Page Designer ID or Content Asset' },
  { name: 'Content Asset', oneOf: 'Page Designer ID or Content Asset' },
  { name: STATUS_HEADER, required: true },
];

// Key of a content asset's jsonData that holds its page type (as the library already has it,
// e.g. {"relatedFolderID": "faq", "analyticsPageCategory" : "content page::service"}).
const ASSET_PAGE_TYPE_KEY = 'analyticsPageCategory';

// Locales offered in the UI (legacy template + English/Dutch variants). x-default is always included.
// Display order: the five main markets first, then the rest by country population,
// keeping each country's locales together.
const XML_LOCALES = [
  'es-ES', 'fr-FR', 'en-GB', 'de-DE', 'it-IT',
  'tr-TR', 'pl-PL', 'ro-RO', 'nl-NL', 'en-NL', 'fr-BE', 'nl-BE', 'en-BE', 'cs-CZ', 'sv-SE',
  'en-SE', 'he-IL', 'hu-HU', 'de-AT', 'de-CH', 'fr-CH', 'en-CH', 'sr-RS', 'bg-BG', 'da-DK',
  'en-DK', 'no-NO', 'sk-SK', 'en-IE', 'hr-HR', 'sl-SI',
];

// Values a market may choose: the Master Key plus the intentional "others" bucket.
const XML_PAGE_TYPES = [...ACCEPTED_PAGE_TYPES, 'others'];

/**
 * Picks the rows to put in the XML: they need a Page Designer ID (used as content-id) or, when
 * there is none, a Content Asset ID, and a page type to implement other than "OK". Rows whose
 * value is not an accepted page type, or whose ID appears with different page types, are skipped.
 * Returns { entries: [{ contentId, pageType }] (Page Designer), assets: [{ contentId, pageType,
 * address }] (content assets, need the library: see buildAssetUpdates),
 * skipped: [{ address, contentId, value, reason }] }.
 */
function buildXmlEntries(records) {
  const groups = { page: new Map(), asset: new Map() };
  const skipped = [];

  for (const record of records) {
    const pageId = record['Page Designer ID'];
    const assetId = record['Content Asset'];
    const kind = pageId ? 'page' : assetId ? 'asset' : '';
    const contentId = pageId || assetId;
    const pageType = normalize(record[STATUS_HEADER]);
    if (!kind || !pageType || pageType === 'ok') continue;

    if (!XML_PAGE_TYPES.includes(pageType)) {
      skipped.push({ address: record.Address, contentId, value: record[STATUS_HEADER], reason: 'Not an accepted page type' });
      continue;
    }
    if (kind === 'asset' && contentId.includes('%')) {
      skipped.push({ address: record.Address, contentId, value: pageType, reason: 'Content Asset ID is not usable (contains %)' });
      continue;
    }
    const rows = groups[kind].get(contentId) ?? [];
    rows.push({ address: record.Address, pageType });
    groups[kind].set(contentId, rows);
  }

  const pick = (kind, label) => {
    const picked = [];
    for (const [contentId, rows] of groups[kind]) {
      if (rows.every((row) => row.pageType === rows[0].pageType)) {
        picked.push({ contentId, pageType: rows[0].pageType, address: rows[0].address });
      } else {
        rows.forEach((row) =>
          skipped.push({ address: row.address, contentId, value: row.pageType, reason: `Same ${label} with different page types` })
        );
      }
    }
    return picked;
  };
  const entries = pick('page', 'Page Designer ID').map(({ contentId, pageType }) => ({ contentId, pageType }));
  const assets = pick('asset', 'Content Asset ID');
  return { entries, assets, skipped };
}

const unescapeXml = (text) => {
  const cdata = text.match(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/);
  if (cdata) return cdata[1];
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&');
};

/**
 * Reads the jsonData of the given content assets from a library export (the whole XML as text;
 * libraries are big, so only these IDs are looked up instead of parsing the whole file).
 * Returns a Map: content-id -> { jsonData: { 'x-default': '…', 'fr-FR': '…' } } for the IDs found.
 */
function readLibraryAssets(libraryText, ids) {
  const found = new Map();
  for (const id of new Set(ids)) {
    // Tabs and line breaks in an ID are written as character references in the export.
    const marker = `content-id="${escapeAttr(id).replace(/\t/g, '&#9;').replace(/\n/g, '&#10;').replace(/\r/g, '&#13;')}"`;
    let at = libraryText.indexOf(marker);
    // Skip <content-link content-id="…"> references: only a <content …> start tag counts.
    while (at !== -1 && !libraryText.startsWith('<content ', libraryText.lastIndexOf('<', at))) {
      at = libraryText.indexOf(marker, at + marker.length);
    }
    if (at === -1) continue;

    const startTagEnd = libraryText.indexOf('>', at);
    const selfClosing = libraryText[startTagEnd - 1] === '/';
    const end = libraryText.indexOf('</content>', startTagEnd);
    const body = selfClosing || end === -1 ? '' : libraryText.slice(startTagEnd + 1, end);

    const jsonData = {};
    for (const match of body.matchAll(/<custom-attribute\b([^>]*?)(?:\/>|>([\s\S]*?)<\/custom-attribute>)/g)) {
      if (!/attribute-id\s*=\s*"jsonData"/.test(match[1])) continue;
      const lang = match[1].match(/xml:lang\s*=\s*"([^"]*)"/)?.[1] ?? 'x-default';
      jsonData[lang] = unescapeXml(match[2] ?? '');
    }
    found.set(id, { jsonData });
  }
  return found;
}

/**
 * Decides the jsonData to write for each content asset: the library's x-default jsonData with
 * analyticsPageCategory added or changed, everything else kept (the import replaces the whole
 * value, so it must be merged here). An asset is left out, to update by hand, when it has its own
 * jsonData for one of the ticked locales (a locale value wins over x-default, also "fr" for fr-FR)
 * or when its jsonData isn't valid JSON; also when it isn't in the library. Assets that already have
 * the value need nothing.
 * Returns { updates: [{ contentId, pageType, json }], unchanged: [contentId],
 * skipped: [{ address, contentId, value, reason }] }.
 */
function buildAssetUpdates(assets, library, locales) {
  const updates = [];
  const unchanged = [];
  const skipped = [];
  const ticked = locales.map((locale) => locale.toLowerCase());
  const covers = (lang) => ticked.some((locale) => locale === lang.toLowerCase() || locale.split('-')[0] === lang.toLowerCase());

  for (const { contentId, pageType, address } of assets) {
    const skip = (reason) => skipped.push({ address, contentId, value: pageType, reason });
    const asset = library.get(contentId);
    if (!asset) {
      skip('Content asset not found in the library');
      continue;
    }
    const own = Object.keys(asset.jsonData).filter((lang) => lang !== 'x-default' && covers(lang));
    if (own.length) {
      skip(`Has its own jsonData for ${own.join(', ')}: update it by hand`);
      continue;
    }
    const current = (asset.jsonData['x-default'] ?? '').trim();
    let data = {};
    if (current) {
      try {
        data = JSON.parse(current);
      } catch {
        data = null;
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        skip('Its jsonData is not valid JSON: update it by hand');
        continue;
      }
    }
    if (data[ASSET_PAGE_TYPE_KEY] === pageType) {
      unchanged.push(contentId);
      continue;
    }
    data[ASSET_PAGE_TYPE_KEY] = pageType;
    updates.push({ contentId, pageType, json: JSON.stringify(data, null, 4) });
  }
  return { updates, unchanged, skipped };
}

const escapeText = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (value) => escapeText(value).replace(/"/g, '&quot;');

/**
 * Builds the library XML: Page Designer entries (x-default first, then the locales) and content
 * asset updates from buildAssetUpdates (their jsonData, x-default only).
 */
function buildXml(entries, locales, assetUpdates = []) {
  const langs = ['x-default', ...locales];
  const pages = entries.map(({ contentId, pageType }) => {
    const json = escapeText(`{ "stylesheetID" : "content", "pageCategory" : "${pageType}" }`);
    const data = langs.map((lang) => `\t\t<data xml:lang="${lang}">${json} </data>`);
    return [`\t<content content-id="${escapeAttr(contentId)}">`, ...data, '\t</content>'].join('\n');
  });
  const assets = assetUpdates.map(({ contentId, json }) =>
    [
      `\t<content content-id="${escapeAttr(contentId)}">`,
      '\t\t<custom-attributes>',
      `\t\t\t<custom-attribute attribute-id="jsonData" xml:lang="x-default">${escapeText(json)}</custom-attribute>`,
      '\t\t</custom-attributes>',
      '\t</content>',
    ].join('\n')
  );
  const blocks = [...pages, ...assets];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<library xmlns="http://www.demandware.com/xml/impex/library/2006-10-31">',
    ...blocks,
    '</library>',
    '',
  ].join('\n');
}

/** PageType_Update_YYYYMMDD_HHMM.xml (local date and time, 24h). */
function xmlFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `PageType_Update_${day}_${time}.xml`;
}
