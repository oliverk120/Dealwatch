const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const {
    initializeDb,
    saveArticle,
    getAllArticles,
    getArticleByLink,
} = require('../src/database');

test('saveArticle ignores duplicate links and handles quotes', () => {
    const dbPath = '/tmp/test_db.sqlite';
    try { fs.unlinkSync(dbPath); } catch {}
    initializeDb(dbPath);
    const article = {
        link: 'link1',
        title: "Bob's title",
        description: 'desc',
        pubDate: 'date',
        feed_url: 'feed',
        item_json: { foo: 'bar' },
    };
    saveArticle(article, [0, 1]);
    saveArticle(article, [0, 1]);
    const rows = getAllArticles();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, "Bob's title");
    assert.deepEqual(getArticleByLink('link1').embedding, [0, 1]);
    fs.unlinkSync(dbPath);
});
