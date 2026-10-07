# SEO DECtor | DEC

Browser-based SEO audit tools for a Screaming Frog crawl:

- **Page type**: checks the GEO page type of every URL, produces an Excel report that markets
  complete offline, then the SFCC library import XML.
- **Metadata**: finds titles, meta descriptions and H1s to fix, produces an Excel report for the
  market, then SFCC catalog/library import XMLs with their new texts.

## Run

No build step, no server, no internet needed: open `index.html` in a browser (double-click).
To share it, zip the folder and send it.

Libraries are bundled in `vendor/`: PapaParse 5.4.1 and ExcelJS 4.4.0 (both MIT).

All processing happens in the browser; uploaded crawls are never sent to a server.

## Maintaining

See [MAINTAINING.md](MAINTAINING.md) for how the app works, how to change it, how to test it
and how to release a new version.
