// Step 2: turn the report completed by a market into a Salesforce Commerce Cloud
// library import XML. Pure functions, no DOM. Relies on pagetype.js.

// Columns read from the completed report. Loose header matching (headerKey in pagetype.js)
// covers the Step 1 export, the legacy "PageType update XML in bulk" template and market files.
const XML_COLUMN_SPECS = [
  { name: 'Address', required: true },
  { name: 'Page Designer ID', required: true }, // also matches "Page Designer 1", "PAGE DESIGNER"…
  { name: STATUS_HEADER, required: true },
];

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
 * Picks the rows to put in the XML: they need a Page Designer ID (used as content-id)
 * and a page type to implement other than "OK". Rows whose value is not an accepted
 * page type, or whose content-id appears with different page types, are skipped.
 * Returns { entries: [{ contentId, pageType }], skipped: [{ address, contentId, value, reason }] }.
 */
function buildXmlEntries(records) {
  const byId = new Map();
  const skipped = [];

  for (const record of records) {
    const contentId = record['Page Designer ID'];
    const pageType = normalize(record[STATUS_HEADER]);
    if (!contentId || !pageType || pageType === 'ok') continue;

    if (!XML_PAGE_TYPES.includes(pageType)) {
      skipped.push({ address: record.Address, contentId, value: record[STATUS_HEADER], reason: 'Not an accepted page type' });
      continue;
    }
    const rows = byId.get(contentId) ?? [];
    rows.push({ address: record.Address, pageType });
    byId.set(contentId, rows);
  }

  const entries = [];
  for (const [contentId, rows] of byId) {
    if (rows.every((row) => row.pageType === rows[0].pageType)) {
      entries.push({ contentId, pageType: rows[0].pageType });
    } else {
      rows.forEach((row) =>
        skipped.push({ address: row.address, contentId, value: row.pageType, reason: 'Same Page Designer ID with different page types' })
      );
    }
  }
  return { entries, skipped };
}

const escapeText = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (value) => escapeText(value).replace(/"/g, '&quot;');

/** Builds the library XML for the given entries and locales (x-default is added first). */
function buildXml(entries, locales) {
  const langs = ['x-default', ...locales];
  const blocks = entries.map(({ contentId, pageType }) => {
    const json = escapeText(`{ "stylesheetID" : "content", "pageCategory" : "${pageType}" }`);
    const data = langs.map((lang) => `\t\t<data xml:lang="${lang}">${json} </data>`);
    return [`\t<content content-id="${escapeAttr(contentId)}">`, ...data, '\t</content>'].join('\n');
  });

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
