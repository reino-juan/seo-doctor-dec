# SEO Doctor | DEC

Browser-based tool that checks the GEO page type of every URL in a Screaming Frog crawl
and produces an Excel report that markets can complete offline.

## Run

No build step, no server, no internet needed: open `index.html` in a browser (double-click).
To share it, zip the folder and send it.

Libraries are bundled in `vendor/`: PapaParse 5.4.1 and ExcelJS 4.4.0 (both MIT).

All processing happens in the browser; uploaded crawls are never sent to a server.
