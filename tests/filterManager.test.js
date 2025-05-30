const { test } = require('node:test');
const assert = require('node:assert/strict');
const { FilterManager } = require('../src/filters/filterManager');

test('FilterManager applies keyword and semantic filters', () => {
    const manager = new FilterManager({
        keywords: ['foo'],
        queryEmbedding: [1, 0],
        threshold: 0.5,
    });

    const article = { title: 'Foo bar', embedding: [1, 0] };
    const result = manager.apply(article);
    assert.ok(result.reasons.some((r) => r.includes('keywords')));
    assert.ok(result.reasons.some((r) => r.includes('similarity')));
    assert.equal(result.similarity, 1);
});


