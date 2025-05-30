function keywordFilter(text, keywords = []) {
    if (!text) return { matched: false, hits: [] };
    const lower = text.toLowerCase();
    const hits = keywords.filter((k) => lower.includes(k.toLowerCase()));
    return { matched: hits.length > 0, hits };
}

module.exports = { keywordFilter };
