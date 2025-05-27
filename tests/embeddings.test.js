const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEmbeddingPromise } = require('../src/embeddings');

test('createEmbeddingPromise rejects when OPENAI_API_KEY not set', async () => {
    delete process.env.OPENAI_API_KEY;
    await assert.rejects(
        createEmbeddingPromise('test'),
        new Error('OPENAI_API_KEY environment variable not set'),
    );
});
