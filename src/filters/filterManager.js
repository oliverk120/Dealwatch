const { keywordFilter } = require('./keywordFilter');
const { semanticFilter } = require('./semanticFilter');

class FilterManager {
    constructor(options = {}) {
        this.keywords = options.keywords || [];
        this.queryEmbedding = options.queryEmbedding || null;
        this.threshold = typeof options.threshold === 'number' ? options.threshold : 0;
    }

    static async load(options = {}) {
        // Placeholder for loading from DB in future
        return new FilterManager(options);
    }

    apply(article) {
        const reasons = [];
        let similarity = null;
        if (this.queryEmbedding) {
            const emb = Array.isArray(article.embedding)
                ? article.embedding
                : article.embedding
                ? JSON.parse(article.embedding)
                : null;
            const result = semanticFilter(emb, this.queryEmbedding);
            similarity = result.similarity;
            if (similarity !== null && similarity >= this.threshold) {
                reasons.push(`similarity ${similarity.toFixed(2)} >= ${this.threshold}`);
            }
        }
        if (this.keywords.length > 0) {
            const text = article.title || '';
            const { matched, hits } = keywordFilter(text, this.keywords);
            if (matched) {
                reasons.push(`keywords: ${hits.join(', ')}`);
            }
        }
        return { reasons, similarity };
    }
}

module.exports = { FilterManager };
