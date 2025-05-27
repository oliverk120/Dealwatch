const { execFileSync } = require('child_process');
const fs = require('fs');
let dbPath = null;

function initializeDb(path) {
    dbPath = path;
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, '');
    }
    execFileSync('sqlite3', [dbPath, 'CREATE TABLE IF NOT EXISTS articles (id INTEGER PRIMARY KEY, link TEXT UNIQUE NOT NULL, title TEXT, description TEXT, pubDate TEXT, feed_url TEXT, embedding TEXT, item_json TEXT);']);
}

function escape(val) {
    if (val === null || val === undefined) return 'NULL';
    return "'" + String(val).replace(/'/g, "''") + "'";
}

function saveArticle(article, embedding) {
    if (!dbPath) throw new Error('DB not initialized');
    const sql = `INSERT OR IGNORE INTO articles (link,title,description,pubDate,feed_url,embedding,item_json) VALUES (${escape(article.link)}, ${escape(article.title)}, ${escape(article.description)}, ${escape(article.pubDate)}, ${escape(article.feed_url)}, ${escape(JSON.stringify(embedding))}, ${escape(JSON.stringify(article.item_json || null))});`;
    execFileSync('sqlite3', [dbPath, sql]);
}

function getArticleByLink(link) {
    if (!dbPath) throw new Error('DB not initialized');
    const out = execFileSync('sqlite3', [
        dbPath,
        '-cmd',
        '.mode json',
        `SELECT link,title,description,pubDate,feed_url,embedding,item_json FROM articles WHERE link=${escape(link)} LIMIT 1;`,
    ]);
    const json = out.toString().trim();
    if (!json) return null;
    const arr = JSON.parse(json);
    if (arr.length === 0) return null;
    const r = arr[0];
    return {
        link: r.link,
        title: r.title,
        description: r.description,
        pubDate: r.pubDate,
        feed_url: r.feed_url,
        embedding: r.embedding ? JSON.parse(r.embedding) : null,
        item_json: r.item_json ? JSON.parse(r.item_json) : null,
    };
}

function getAllArticles() {
    if (!dbPath) throw new Error('DB not initialized');
    const out = execFileSync('sqlite3', [dbPath, '-cmd', '.mode json', 'SELECT link,title,description,pubDate,feed_url,embedding,item_json FROM articles;']);
    const json = out.toString().trim();
    if (!json) return [];
    const rows = JSON.parse(json);
    return rows.map(r => ({
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
