const Database = require('better-sqlite3');
let db = null;

function initializeDb(path) {
    db = new Database(path);
    db.prepare(`CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY,
        link TEXT UNIQUE NOT NULL,
        title TEXT,
        description TEXT,
        pubDate TEXT,
        feed_url TEXT,
        embedding TEXT,
        item_json TEXT
    );`).run();
}

function saveArticle(article, embedding) {
    if (!db) throw new Error('DB not initialized');
    const stmt = db.prepare(`INSERT OR IGNORE INTO articles
        (link, title, description, pubDate, feed_url, embedding, item_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(
        article.link,
        article.title,
        article.description,
        article.pubDate,
        article.feed_url,
        JSON.stringify(embedding),
        JSON.stringify(article.item_json || null)
    );
}

function getArticleByLink(link) {
    if (!db) throw new Error('DB not initialized');
    const row = db.prepare(`SELECT link, title, description, pubDate, feed_url, embedding, item_json
        FROM articles WHERE link = ? LIMIT 1`).get(link);
    if (!row) return null;
    return {
        link: row.link,
        title: row.title,
        description: row.description,
        pubDate: row.pubDate,
        feed_url: row.feed_url,
        embedding: row.embedding ? JSON.parse(row.embedding) : null,
        item_json: row.item_json ? JSON.parse(row.item_json) : null,
    };
}

function getAllArticles() {
    if (!db) throw new Error('DB not initialized');
    const rows = db.prepare(`SELECT link, title, description, pubDate, feed_url, embedding, item_json FROM articles`).all();
    return rows.map((r) => ({
        link: r.link,
        title: r.title,
        description: r.description,
        pubDate: r.pubDate,
        feed_url: r.feed_url,
        embedding: r.embedding ? JSON.parse(r.embedding) : null,
        item_json: r.item_json ? JSON.parse(r.item_json) : null,
    }));
}

module.exports = { initializeDb, saveArticle, getAllArticles, getArticleByLink };
