const { test } = require('node:test');
const assert = require('node:assert/strict');
const { keywordFilter } = require('../src/filters/keywordFilter');

test('keywordFilter finds keywords case-insensitively', () => {
    const { matched, hits } = keywordFilter('Hello World', ['world', 'foo']);
    assert.equal(matched, true);
    assert.deepEqual(hits, ['world']);
});


