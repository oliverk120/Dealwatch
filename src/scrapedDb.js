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
      link TEXT UNIQUE,
      published TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE,
      instructions TEXT
    )`);
  });
}

function saveScrapedArticle(url, title, description, link, published) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }
    db.run(
      'INSERT OR IGNORE INTO scraped_articles (url, title, description, link, published) VALUES (?, ?, ?, ?, ?)',
      [url, title, description, link, published || null],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      },
    );
  });
}

function getScrapedArticleByLink(link) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }
    db.get(
      'SELECT id, url, title, description, link, published FROM scraped_articles WHERE link = ?',
      [link],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      },
    );
  });
}

function saveSource(url, instructions) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }
    db.run(
      'INSERT OR REPLACE INTO sources (url, instructions) VALUES (?, ?)',
      [url, instructions],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      },
    );
  });
}

function getSource(url) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }
    db.get(
      'SELECT id, url, instructions FROM sources WHERE url = ?',
      [url],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      },
    );
  });
}

function getSources() {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }
    db.all('SELECT id, url, instructions FROM sources', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
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
  getScrapedArticleByLink,
  saveSource,
  getSource,
  getSources,
  closeScrapedDB,
};
