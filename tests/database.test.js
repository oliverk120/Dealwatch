const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { initializeDb, saveArticle, getAllArticles } = require('../src/database');

test('saveArticle ignores duplicate links', () => {
    const dbPath = '/tmp/test_db.sqlite';
    try { fs.unlinkSync(dbPath); } catch {}
    initializeDb(dbPath);
    const article = {
        link: 'link1',
        title: 'title',
        description: 'desc',
        pubDate: 'date',
        feed_url: 'feed',
        item_json: { foo: 'bar' },
    };
    saveArticle(article, [0, 1]);
    saveArticle(article, [0, 1]);
    const rows = getAllArticles();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].link, 'link1');
});
