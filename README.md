# SEO Doctor | DEC

Browser-based tool that checks the GEO page type of every URL in a Screaming Frog crawl
and produces an Excel report that markets can complete offline.

## Run

No build step. Serve the folder over HTTP and open it in a browser:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

All processing happens in the browser; uploaded crawls are never sent to a server.
