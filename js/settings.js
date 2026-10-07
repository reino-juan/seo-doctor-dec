// Shared lists edited in the Settings tool (locales, catalogs) and read by every tool.
// Kept in this browser (localStorage); without storage the defaults are used.
// Relies on xml.js (XML_LOCALES) and metadata.js (DEFAULT_CATALOGS) for the defaults.

// Countries with a flag in assets/flags/ (4x3 SVGs from flag-icons 7.2.3). Others show a blank flag.
const FLAG_COUNTRIES = [
  'ae', 'al', 'at', 'au', 'ba', 'be', 'bg', 'ca', 'ch', 'cy', 'cz', 'de', 'dk', 'ee', 'eg', 'es',
  'fi', 'fr', 'gb', 'gr', 'hr', 'hu', 'ie', 'il', 'is', 'it', 'kw', 'lt', 'lu', 'lv', 'ma', 'md',
  'mk', 'mt', 'nl', 'no', 'pl', 'pt', 'qa', 'ro', 'rs', 'sa', 'se', 'si', 'sk', 'tr', 'ua', 'us', 'za',
];

// `sorted`: catalogs read best alphabetically; locales keep their order (main markets first,
// new ones at the end).
const SETTINGS_LISTS = {
  locales: { key: 'seo-dector.locales', defaults: XML_LOCALES, sorted: false },
  catalogs: { key: 'seo-dector.catalogs', defaults: DEFAULT_CATALOGS, sorted: true },
};

/**
 * "pt_pt" / "PT-pt" -> "pt-PT"; "fr" -> "fr". Returns '' when it isn't a locale
 * (language of 2–3 letters, optionally a 2-letter country).
 */
function normalizeLocale(value) {
  const match = String(value ?? '').trim().match(/^([a-z]{2,3})(?:[-_]([a-z]{2}))?$/i);
  if (!match) return '';
  return match[2] ? `${match[1].toLowerCase()}-${match[2].toUpperCase()}` : match[1].toLowerCase();
}

/** Flag element for a locale: es-ES -> assets/flags/es.svg; no known country -> blank flag. */
function flagFor(locale) {
  const country = locale.split('-')[1]?.toLowerCase();
  if (!FLAG_COUNTRIES.includes(country)) {
    const blank = document.createElement('span');
    blank.className = 'flag flag-blank';
    return blank;
  }
  const img = document.createElement('img');
  img.className = 'flag';
  img.src = `assets/flags/${country}.svg`;
  img.alt = '';
  img.width = 20;
  img.height = 15;
  return img;
}

/**
 * settings.get('locales'), settings.set('catalogs', list), settings.reset(name),
 * settings.onChange(name, fn) -> fn(list) after every change.
 */
const settings = (() => {
  const values = {};
  const listeners = {};

  const tidy = (name, list) => {
    const unique = [...new Set(list.map((item) => String(item).trim()).filter(Boolean))];
    return SETTINGS_LISTS[name].sorted ? unique.sort((a, b) => a.localeCompare(b)) : unique;
  };

  for (const [name, { key, defaults }] of Object.entries(SETTINGS_LISTS)) {
    listeners[name] = [];
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(key));
    } catch {
      // No storage (private window, blocked site data): use the defaults.
    }
    values[name] = tidy(name, Array.isArray(saved) ? saved : defaults);
  }

  const notify = (name) => listeners[name].forEach((fn) => fn(values[name]));

  return {
    get: (name) => values[name],
    set(name, list) {
      values[name] = tidy(name, list);
      try {
        localStorage.setItem(SETTINGS_LISTS[name].key, JSON.stringify(values[name]));
      } catch {
        // Not saved; the change still applies until the page is closed.
      }
      notify(name);
    },
    reset(name) {
      try {
        localStorage.removeItem(SETTINGS_LISTS[name].key);
      } catch {
        // Nothing saved to remove.
      }
      values[name] = tidy(name, SETTINGS_LISTS[name].defaults);
      notify(name);
    },
    onChange: (name, fn) => listeners[name].push(fn),
  };
})();
