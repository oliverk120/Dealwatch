const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cosineSimilarity } = require('../src/similarity');

test('cosineSimilarity returns 1 for identical vectors', () => {
    const result = cosineSimilarity([1, 2, 3], [1, 2, 3]);
    assert.equal(result, 1);
});

test('cosineSimilarity returns 0 for orthogonal vectors', () => {
    const result = cosineSimilarity([1, 0], [0, 1]);
    assert.equal(result, 0);
});

test('cosineSimilarity handles zero vectors', () => {
    const result = cosineSimilarity([0, 0, 0], [1, 2, 3]);
    assert.equal(result, 0);
});
