const { test } = require('node:test');
const assert = require('node:assert/strict');
const { semanticFilter } = require('../src/filters/semanticFilter');

test('semanticFilter returns similarity value', () => {
    const { similarity } = semanticFilter([1, 0], [1, 0]);
    assert.equal(similarity, 1);
});

test('semanticFilter handles missing embeddings', () => {
    const { similarity } = semanticFilter(null, [1, 2]);
    assert.equal(similarity, null);
});


