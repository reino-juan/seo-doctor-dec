# Maintaining SEO DECtor | DEC

A handover guide for whoever looks after this app. It explains what the app does, how it is
built, how to change the most common things, how to check that nothing broke, and how to
release a new version.

Original author: Juan Reino (2026). No other tools or accounts are needed to work on it:
a text editor, a browser and Git are enough.

---

## 1. What the app does

SEO DECtor replaces several Google Sheets + Apps Script templates used to audit a market's
website. It has two tools in the sidebar, each with two steps (two tabs):

- **Page type**: checks the **GEO page type** that every page declares in its dataLayer (the
  value the 4CAST score relies on).
- **Metadata**: checks titles, meta descriptions and H1s, and turns the market's new texts into
  import files (section 1b).

### 1a. Page type

**Step 1 – Create report**

1. Upload a **Screaming Frog crawl** (`.csv` or `.xlsx`, custom extraction).
2. The app checks each page's page type and shows how many need fixing,
   e.g. "*62 of 213 pages need a page type.*"
3. Download the **Excel report** (`LANCOME_ES_Page_Categorization.xlsx`) and send it to the
   market. Pages without a valid page type are left empty, with a dropdown of accepted values.

**Step 2 – Generate XML**

4. The market sends the completed report back. Upload it in the second tab.
5. Tick the locales of the site and download the **Salesforce Commerce Cloud library import
   XML** (`PageType_Update_YYYYMMDD_HHMM.xml`). It sets the `pageCategory` of each Page
   Designer page.

### 1b. Metadata

**Step 1 – Create report**

1. Upload a **Screaming Frog crawl** with the columns Address, PLP ID 1, PDP ID 1, Title 1 and
   Description 1 (Page Designer 1, Content Asset 1, H1 1, H1 2 and Status Code are used too).
2. The app shows how many pages need a new title or description, e.g. "*233 of 301 pages need a
   new title or description.*" Titles should have **50–60** characters, descriptions **140–155**.
3. Download the **Excel report** (`YSLBEAUTY_FR_Metadata.xlsx`) and send it to the market:
   - `Title + Description`: only the pages to fix. The market writes the new texts in the
     **DEC Title** and **DEC Description** columns; a live length counter turns green or red.
     Grey cells are already fine.
   - `H1`: pages with no H1 or with more than one.

**Step 2 – Generate XML**

4. Upload the completed report. Older country docs that only have URL + DEC Title / DEC
   Description also work: open **Add the crawl of the site (optional)** and drop the crawl so the
   app finds the IDs. The section opens by itself when the file needs it.
5. Tick the **locales** of the texts (same list as Page type; each text is written once per
   locale) and type or pick a **catalog** for products (master catalog) and categories
   (navigation catalog), then download one **XML per type**
   (`DEC_20261007_YSLBEAUTY_FR_SEO_product_fr-FR.xml`). Content pages go to the site library.
   Any catalog ID can be typed; a new one is added to the list when you download.
6. Rows that can't go in the XML are listed on screen with the reason (no ID, not in the crawl,
   same ID with different texts…).

The catalog list can be changed under **Manage catalogs** (bottom of Step 2). Changes are saved
in that browser only; "Restore the default list" brings back the built-in list.

### Both tools

If an uploaded `.xlsx` has more than one sheet with data, the app asks which sheet to use.
It shows each sheet's row count and whether it has the columns that step needs.

Everything runs **in the browser**. Crawl data is never sent anywhere.

---

## 2. How it is built

- **Plain HTML, CSS and JavaScript.** No framework, no build step, no server, no database,
  no Node.js. To host it, copy the files anywhere that serves static files.
- It must keep working when `index.html` is opened by **double-clicking** it (a `file://`
  page, offline). This rules out a few common techniques. Please keep to these rules:
  - **No ES modules** (`import` / `export`). Scripts are ordinary `<script defer>` tags,
    loaded in dependency order in `index.html`, and share the global scope.
  - **No CDN links and no `fetch()` of local files.** Libraries live in `vendor/`.
  - **Fonts are embedded as base64 in `css/fonts.css`.** Chrome refuses font files from
    `file://` pages. Don't replace them with links to font files or Google Fonts.
- Libraries (both MIT licence, committed in `vendor/`):
  - **PapaParse 5.4.1**: reads CSV files.
  - **ExcelJS 4.4.0**: reads `.xlsx` files and writes the Excel report (dropdowns, colours).

### Files

```
index.html          Page layout, the list of scripts (order matters) and the footer version
css/styles.css      All styles (colours and type scale are variables at the top)
css/fonts.css       Archivo + Bodoni Moda fonts, embedded (SIL Open Font License)
assets/dec-logo.png DEC logo (header + browser tab icon)
assets/flags/       One SVG flag per country (from the flag-icons package, MIT)
vendor/             PapaParse and ExcelJS

js/pagetype.js      RULES (Page type): accepted page types, crawl columns, Step 1 checks, file names
js/xml.js           RULES (Page type): Step 2 row selection, locale list, XML format
js/report.js        Builds the Page type Excel report
js/metadata.js      RULES (Metadata): crawl columns, IDs, length ranges, Step 2 rows, text
                    encoding, XML format, locales, default catalog list
js/metadata-report.js  Builds the Metadata Excel report
js/app.js           Shared upload flow (read file, drop zone, spinner, errors, sheet chooser),
                    download, step tabs, sidebar tool switching, wording helpers
js/step-report.js   Page type Step 1 screen
js/step-xml.js      Page type Step 2 screen
js/step-meta-report.js  Metadata Step 1 screen
js/step-meta-xml.js     Metadata Step 2 screen + "Manage catalogs"
```

The **rules** files (`pagetype.js`, `xml.js`, `metadata.js`) never touch the page. They take data in and give
data back, which keeps them easy to read and test. The **screen** files (`step-*.js`) only
handle the page. They are each wrapped in `(() => { ... })();` so their variable names don't
clash with each other.

---

## 3. The rules

### Crawl columns (Step 1), `COLUMN_SPECS` in `js/pagetype.js`

Headers are matched ignoring upper/lower case. A note in brackets, a trailing "1" and the word
"ID" are optional (`DEC Title (50-60 characters)` = `DEC Title`):
`PLP ID 1`, `PLP ID`, `PLP 1` and `PLP` are all accepted, and so is `PAGE DESIGNER` for
`Page Designer 1`. This also applies in Step 2. Every other column in the file is ignored.

| Column            | Also accepted        | Required | Used for                          |
|-------------------|----------------------|----------|-----------------------------------|
| `Address`         |                      | yes      | Page URL                          |
| `PLP ID 1`        |                      | yes      | Confirms a product listing page   |
| `PDP ID 1`        |                      | yes      | Confirms a product detail page    |
| `Content Asset 1` | `CONTENT ASSET ID 1` | no       | Copied to the report              |
| `Page Designer 1` | `PAGE DESIGNER ID 1` | no       | Copied to the report (Step 2 key) |
| `GEO Page Type 1` |                      | yes      | The value being checked           |

### Accepted page types (the "Master Key"), `ACCEPTED_PAGE_TYPES` in `js/pagetype.js`

| Bucket         | Value(s)                                                                  |
|----------------|---------------------------------------------------------------------------|
| Homepage       | `homepage`                                                                |
| PLP            | `product selector page`                                                   |
| PDP            | `product detail page`                                                     |
| Editorial page | `content page::article`                                                   |
| Landing page   | `content page::branding page`, `content page::service`, `service::guide`  |
| Others         | anything else, empty, or wrong (not scorable)                             |

### Step 1 checks, `validate()` in `js/pagetype.js`

- `product selector page` is OK only if the page has a `PLP ID 1`.
- `product detail page` is OK only if the page has a `PDP ID 1`.
- `homepage` is OK only if exactly one page in the crawl has it. Otherwise it's marked **ERROR**.
- The editorial and landing values are always OK.
- Anything else is left **empty** for the market to fill in.

The count shown on screen is the number of pages that are empty or ERROR.

### Step 2 XML, `js/xml.js`

- Reads `Address`, `Page Designer ID` (or `Page Designer 1`) and `GEO Page Type to Implement`.
- A page goes into the XML only if it has a **Page Designer ID** (used as `content-id`) and the
  market chose a value other than empty or `OK`.
- The value must be a Master Key value or `others`. Anything else is **left out and listed on
  screen**. So are pages that share a Page Designer ID but have different values.
- `x-default` is always written, followed by the ticked locales.
- **Known limitation:** pages that only have a Content Asset ID are not included yet.

XML format, which must stay exactly like this:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<library xmlns="http://www.demandware.com/xml/impex/library/2006-10-31">
	<content content-id="transparencia">
		<data xml:lang="x-default">{ "stylesheetID" : "content", "pageCategory" : "content page::branding page" } </data>
		<data xml:lang="es-ES">{ "stylesheetID" : "content", "pageCategory" : "content page::branding page" } </data>
	</content>
</library>
```

### Metadata, `js/metadata.js`

- **Which pages:** status 200 (if the crawl has Status Code) and not a file (`.jpg`, `.js`,
  `.png`, `.css`, `.svg`, `.pdf`, `.gif`, `?`, `cdn-cgi`, `demandware` in the URL).
- **Type and ID** of a page: PLP ID → `category`; else PDP ID → `product`; else Page Designer →
  `content`; else Content Asset (without `%`) → `content`; else `manual`. Manual pages are in the
  report but never in the XML: their metadata is changed by hand in Business Manager.
- **Lengths:** `TITLE_RANGE` (50–60) and `DESCRIPTION_RANGE` (140–155). The report headers and
  colours follow these values.
- **Step 2:** empty, `-` and `****` in a DEC column mean "keep the current text". Rows with the
  same type + ID are merged when their texts agree, and left out when they differ.
- **Special characters:** `&`, `<`, `>` are escaped and every accent or symbol is written as a
  code (`é` → `&#233;`), as the old template did. Curly apostrophes become `'`, `–` becomes `-`.

XML format (products and categories use `<catalog … catalog-id="…">`, content uses `<library>`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<catalog xmlns="http://www.demandware.com/xml/impex/catalog/2006-10-31" catalog-id="ysl-master-catalog">
<product product-id="WW-51213YSL">
	<page-attributes>
		<page-title xml:lang="fr">…</page-title>
		<page-description xml:lang="fr">D&#233;couvrez LE PARFUM…</page-description>
	</page-attributes>
</product>
</catalog>
```

---

## 4. Common changes

| I want to…                              | Change this                                                                 |
|-----------------------------------------|-----------------------------------------------------------------------------|
| Accept a new page type value            | `ACCEPTED_PAGE_TYPES` in `js/pagetype.js`. It updates the Excel dropdown and the XML check. |
| Accept a new crawl column name          | Usually nothing to do (see the matching rule in section 3). For a name that differs in other ways, add it to `aliases` in `COLUMN_SPECS` (`js/pagetype.js`) |
| Accept a new column name in Step 2      | Add it to `aliases` in `XML_COLUMN_SPECS` (`js/xml.js`)                     |
| Add a locale (both tools)               | Add it to `XML_LOCALES` in `js/xml.js`. If the country is new, add its flag as `assets/flags/<country>.svg` (4x3 SVG from the flag-icons package, lowercase code, e.g. `pt.svg`). |
| Change a text on screen                 | `index.html` (fixed text) or the `js/step-*.js` file of that screen (results) |
| Change the title/description lengths    | `TITLE_RANGE` / `DESCRIPTION_RANGE` in `js/metadata.js`                     |
| Change the built-in catalog list        | `DEFAULT_CATALOGS` in `js/metadata.js` (users' own changes in "Manage catalogs" stay in their browser) |
| Change colours or fonts sizes           | Variables at the top of `css/styles.css`                                    |
| Add a new tool to the sidebar           | New rules file + screen file in `js/`, a section in `index.html`, a link in the sidebar, and the `<script>` tags in the right order |

Design rules the app follows. Please keep to them so it stays consistent:
- Navy `#1d2c3f` (from the logo) for text and buttons.
- Red `#a8233a` only for counts that need fixing.
- Sentence case, not capitals.
- Any number shown to users uses `plural()` from `js/app.js`, so it reads "1 page", not "1 pages".

---

## 5. Checking that nothing broke

There are no automated tests. Before releasing, open the app and run these files. They are in
the **handover zip** (`examples/` folder), not in GitHub, because they contain real crawl data.

| Step | File                                    | Expected result                                   |
|------|-----------------------------------------|---------------------------------------------------|
| 1    | `mugler_fr_crawl.csv`                   | "62 of 252 pages need a page type." (mugler.fr)   |
| 1    | `lancome_es_custom_extraction_all.csv`  | "62 of 213 pages need a page type." (lancome.es)  |
| 2    | `lancome_es_completed.csv`              | "196 pages will get their new page type."         |
| Metadata 1 | `ysl_fr_metadata_crawl.csv`       | "233 of 301 pages need a new title or description." |
| Metadata 2 | `ysl_fr_country_doc_descriptions.csv` + the crawl above | "183 pages will get new metadata." (137 products, 3 categories, 43 content pages) |

`lancome_es_expected_entries.json` lists the exact 196 `content-id → page type` pairs that the
original Google Sheet produced for that file. The Step 2 XML must contain exactly those.
`ysl_fr_expected_products.json` does the same for the 137 Metadata product descriptions.

`examples/` also has test pages that run these checks automatically in a browser
(`test-columns.html`, `test-sheet-picker.html`, `test-metadata.html`, `test-metadata-ui.html`).
Serve the project folder (`python3 -m http.server 8765`) and open them, e.g.
`http://localhost:8765/examples/test-metadata.html`.

Also check quickly:
- Download the Excel report and open it. The dropdown appears on the empty cells.
- Tick a locale and download the XML. It opens in a browser without errors.
- Upload a workbook with several sheets (e.g. one of the legacy templates in the handover zip).
  The sheet chooser appears, and picking the right sheet gives a result.
- Open `index.html` by **double-clicking** it (not through a web server). Fonts, logo and
  flags all show.

---

## 6. Releasing a new version

1. Make the change and run the checks in section 5.
2. Update the version in the footer of `index.html` (`Version x.y.z`):
   - **x.y.z+1** for fixes and wording
   - **x.y+1.0** for new features (new locale, new tool)
   - **x+1.0.0** when the Excel report or XML format changes (people's files change)
3. Commit and push to GitHub.
4. That's it: GitHub Pages republishes the site automatically 1–2 minutes after each push to
   `main` (section 7). Reload the live URL and check the footer shows the new version.

Version history: see `git log`.

---

## 7. Where things are

- **Code:** GitHub repository `seo-doctor-dec`. Everything needed to run the app is in it,
  and nothing else.
- **Handover zip** (keep it on a team shared drive, not in GitHub):
  - `examples/`: test files and expected results (section 5).
  - `legacy/`: the original Google Sheets templates (Page type and Metadata), their Apps Script,
    the "Master Key" image, the wireframe and the logo source.
  - `CLAUDE.md`: the same knowledge as this file, written for the Claude Code AI assistant.
    If you use Claude Code, put it in the project folder and Claude will follow it
    automatically.
  - `code/`: a snapshot of the repository at handover time.
- **Hosting:** GitHub Pages, from the `main` branch, root folder (enabled 2026-10-01).
  - Live URL: **https://reino-juan.github.io/seo-doctor-dec/**
  - Every push to `main` republishes the site automatically. There's nothing else to do.
  - Settings: repository **Settings → Pages** (Source: *Deploy from a branch*, `main`, `/ (root)`).
  - Free because the repository is **public**. Making it private turns the site off unless the
    owner has a paid GitHub plan.
  - If the repository is transferred to an organization, the URL becomes
    `https://<organization>.github.io/seo-doctor-dec/`. Tell users the new link.
  - Everything in the repository is reachable on the site, including this file. Never commit
    crawl data, templates or anything confidential.
- **Contact / owner:** fill in after handover (and update the footer in `index.html`).
