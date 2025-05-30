const { cosineSimilarity } = require('../similarity');

function semanticFilter(articleEmbedding, queryEmbedding) {
    if (!articleEmbedding || !queryEmbedding) {
        return { similarity: null };
    }
    const similarity = cosineSimilarity(articleEmbedding, queryEmbedding);
    return { similarity };
}

module.exports = { semanticFilter };
