const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
    initScrapedDB,
    saveScrapedArticle,
    getScrapedArticles,
    getScrapedArticleByLink,
    saveSource,
    getSource,
    getSources,
    closeScrapedDB,
} = require('../src/scrapedDb');

test('scraped articles deduplicate on link', async () => {
    const tmpPath = path.join(os.tmpdir(), `scraped_${Date.now()}.sqlite`);
    initScrapedDB(tmpPath);
    await saveScrapedArticle('http://example.com', 't1', 'd1', 'http://ex/a', null);
    await saveScrapedArticle('http://example.com', 't1', 'd1', 'http://ex/a', null);
    const rows = await getScrapedArticles();
    assert.equal(rows.length, 1);
    const row = await getScrapedArticleByLink('http://ex/a');
    assert.ok(row);
    closeScrapedDB();
    fs.unlinkSync(tmpPath);
});

test('sources persisted and retrievable', async () => {
    const tmpPath = path.join(os.tmpdir(), `sources_${Date.now()}.sqlite`);
    initScrapedDB(tmpPath);
    await saveSource('http://example.com/list', '{"a":1}');
    const src = await getSource('http://example.com/list');
    assert.equal(src.instructions, '{"a":1}');
    const sources = await getSources();
    assert.equal(sources.length, 1);
    closeScrapedDB();
    fs.unlinkSync(tmpPath);
});
