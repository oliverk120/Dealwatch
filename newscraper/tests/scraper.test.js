const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { parseString } = require('xml2js');
const { scrapeToRSS } = require('../src/scraper');
const { parsePrnewswire } = require('../src/scraper');

const html = `
<html><body>
    <a href="/a1">First</a>
    <a href="/a2">Second</a>
</body></html>`;

test('scrapeToRSS builds rss feed from html page', async () => {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    });

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
        const xml = await scrapeToRSS(`http://localhost:${port}/`);
        await new Promise((resolve, reject) => {
            parseString(xml, (err, result) => {
                if (err) return reject(err);
                const items = result.rss.channel[0].item;
                assert.equal(items.length, 2);
                assert.equal(items[0].title[0], 'First');
                assert.equal(items[0].link[0], `http://localhost:${port}/a1`);
                resolve();
            });
        });
    } finally {
        server.close();
    }
});

test('parsePrnewswire extracts articles', () => {
    const snippet = `
    <div class="row newsCards" lang="en-US">
        <div class="col-sm-12 card">
            <a class="newsreleaseconsolidatelink display-outline w-100" href="/news-releases/hotel101-progresses-towards-nasdaq-listing-302470771.html" role="group" aria-label="News Release">
    <h3 class="no-top-margin remove-outline">
        <small>10:10 ET</small>
        HOTEL101 PROGRESSES TOWARDS NASDAQ LISTING
    </h3>
            <p class="remove-outline">Hotel101 Global Holdings Corp. ("Hotel101" or "HBNB") and JVSPAC Acquisition Corp. (NASDAQ: JVSA) ("JVSPAC") announced today that the United States...</p>
            </a>
        </div>
    </div>`;

    const result = parsePrnewswire(snippet, 'https://www.prnewswire.com/');
    const items = result.items;
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'HOTEL101 PROGRESSES TOWARDS NASDAQ LISTING');
    assert.ok(items[0].description.startsWith('Hotel101 Global'));
    assert.equal(
        items[0].link,
        'https://www.prnewswire.com/news-releases/hotel101-progresses-towards-nasdaq-listing-302470771.html',
    );
    assert.ok(items[0].published.startsWith(new Date().toISOString().split('T')[0]));
});
