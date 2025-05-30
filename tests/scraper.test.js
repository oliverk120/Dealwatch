const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { parseString } = require('xml2js');
const { scrapeToRSS, scrapeLinks } = require('../src/scraper');

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

test('scrapeLinks extracts titles and absolute links', async () => {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
    });

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
        const items = await scrapeLinks(`http://localhost:${port}/`);
        assert.equal(items.length, 2);
        assert.equal(items[0].title, 'First');
        assert.equal(items[0].link, `http://localhost:${port}/a1`);
    } finally {
        server.close();
    }
});
