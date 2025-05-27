const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db;

function initDB(customPath) {
  const dbPath =
    customPath ||
    process.env.DATABASE_PATH ||
    path.join(__dirname, '..', 'database.db');
  db = new sqlite3.Database(dbPath);
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      link TEXT NOT NULL UNIQUE,
      embedding TEXT
    )`);
  });
}

function saveArticle(title, link, embedding) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }
    const embStr = embedding ? JSON.stringify(embedding) : null;
    db.run(
      'INSERT OR IGNORE INTO articles (title, link, embedding) VALUES (?, ?, ?)',
      [title, link, embStr],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      },
    );
  });
}

function getArticleByLink(link) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }
    db.get(
      'SELECT id, title, link, embedding FROM articles WHERE link = ?',
      [link],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      },
    );
  });
}

function getArticles() {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }
    db.all('SELECT id, title, link, embedding FROM articles', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { initDB, saveArticle, getArticles, getArticleByLink, closeDB };
