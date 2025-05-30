const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { fetchRSS } = require('../src/rss');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Sample Feed</title>
    <item><title>Hello</title></item>
  </channel>
</rss>`;

test('fetchRSS parses RSS feed from HTTP server', async () => {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        res.end(xml);
    });

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
        const result = await fetchRSS(`http://localhost:${port}/`);
        assert.equal(result.rss.channel[0].title[0], 'Sample Feed');
    } finally {
        server.close();
    }
});

const xmlInvalid = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Sample Feed</title>
    <item><title>Hello & goodbye</title></item>
  </channel>
</rss>`;

test('fetchRSS tolerates unescaped ampersands', async () => {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        res.end(xmlInvalid);
    });

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
        const result = await fetchRSS(`http://localhost:${port}/`);
        assert.equal(result.rss.channel[0].item[0].title[0], 'Hello & goodbye');
    } finally {
        server.close();
    }
});
