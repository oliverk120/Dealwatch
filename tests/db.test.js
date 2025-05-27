const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { initDB, saveArticle, getArticles, closeDB } = require('../src/db');

test('saveArticle and getArticles round trip', async () => {
    const tmpPath = path.join(os.tmpdir(), `dbtest_${Date.now()}.sqlite`);
    initDB(tmpPath);
    await saveArticle('Example', 'http://example.com');
    const rows = await getArticles();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].title, 'Example');
    assert.equal(rows[0].link, 'http://example.com');
    closeDB();
    fs.unlinkSync(tmpPath);
});
