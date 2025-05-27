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
    closeDB,
} = require('../src/db');

test('saveArticle and getArticles round trip with embedding', async () => {
    const tmpPath = path.join(os.tmpdir(), `dbtest_${Date.now()}.sqlite`);
    initDB(tmpPath);
    const emb = [0.1, 0.2, 0.3];
    await saveArticle('Example', 'http://example.com', emb);

    const rows = await getArticles();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, 'Example');
    assert.equal(rows[0].link, 'http://example.com');

    assert.deepEqual(JSON.parse(rows[0].embedding), emb);
    const row = await getArticleByLink('http://example.com');
    assert.deepEqual(JSON.parse(row.embedding), emb);

    closeDB();
    fs.unlinkSync(tmpPath);
});
