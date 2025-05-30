const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');


const {
    initDB,
    saveArticle,
    getArticles,
    getArticleByLink,
    addFeed,
    getFeeds,
    updateFeed,
    deleteFeed,
    closeDB,
} = require('../src/db');

test('saveArticle and getArticles round trip with embedding and image', async () => {
    const tmpPath = path.join(os.tmpdir(), `dbtest_${Date.now()}.sqlite`);
    initDB(tmpPath);
    const emb = [0.1, 0.2, 0.3];
    const pub = '2020-01-01T00:00:00.000Z';
    await saveArticle('Example', 'http://example.com', emb, 'http://img.com/img.jpg', pub);

    const rows = await getArticles();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, 'Example');
    assert.equal(rows[0].link, 'http://example.com');

    assert.deepEqual(JSON.parse(rows[0].embedding), emb);
    assert.equal(rows[0].image, 'http://img.com/img.jpg');
    assert.equal(rows[0].published, pub);
    const row = await getArticleByLink('http://example.com');
    assert.deepEqual(JSON.parse(row.embedding), emb);
    assert.equal(row.image, 'http://img.com/img.jpg');
    assert.equal(row.published, pub);

    closeDB();
    fs.unlinkSync(tmpPath);
});

test('feed CRUD functions work', async () => {
    const tmpPath = path.join(os.tmpdir(), `dbtest_${Date.now()}_feeds.sqlite`);
    initDB(tmpPath);
    const id = await addFeed('http://example.com/rss');
    let feeds = await getFeeds();
    assert.equal(feeds.length, 1);
    assert.equal(feeds[0].url, 'http://example.com/rss');

    await updateFeed(id, { lastFetched: '2021-01-01T00:00:00Z' });
    feeds = await getFeeds();
    assert.equal(feeds[0].last_fetched, '2021-01-01T00:00:00Z');

    await deleteFeed(id);
    feeds = await getFeeds();
    assert.equal(feeds.length, 0);

    closeDB();
    fs.unlinkSync(tmpPath);
});
