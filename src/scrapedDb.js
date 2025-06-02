const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db;

function initScrapedDB(customPath) {
  const dbPath =
    customPath ||
    process.env.SCRAPED_DB_PATH ||
    path.join(__dirname, '..', 'scraped.db');
  db = new sqlite3.Database(dbPath);
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS scraped_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      title TEXT,
      description TEXT,
      link TEXT,
      published TEXT
    )`);
  });
}

function saveScrapedArticle(url, title, description, link, published) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }
    db.run(
      'INSERT INTO scraped_articles (url, title, description, link, published) VALUES (?, ?, ?, ?, ?)',
      [url, title, description, link, published || null],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      },
    );
  });
}

function getScrapedArticles() {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }
    db.all(
      'SELECT id, url, title, description, link, published FROM scraped_articles',
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      },
    );
  });
}

function closeScrapedDB() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initScrapedDB,
  saveScrapedArticle,
  getScrapedArticles,
  closeScrapedDB,
};
