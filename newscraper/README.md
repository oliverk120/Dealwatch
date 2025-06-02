# Newscraper

This package contains the stand-alone scraping utility used by DealWatch. It can be hosted separately and only shares the SQLite database with the main application.

## Usage

Install dependencies and run the scraper for a URL:

```bash
npm install
node index.js <url>
```

The scraped articles are stored in `scraped.db` (or the path specified via `SCRAPED_DB_PATH`).

Run the unit tests with `npm test`.
