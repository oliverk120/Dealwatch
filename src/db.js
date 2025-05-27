const sqlite3 = require('sqlite3').verbose();
const path = require('path');

let db;

function initDB() {
  const dbPath = path.join(__dirname, '..', 'database.db');
  db = new sqlite3.Database(dbPath);
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      link TEXT NOT NULL
    )`);
  });
}

function saveArticle(title, link) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }
    db.run(
      'INSERT INTO articles (title, link) VALUES (?, ?)',
      [title, link],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function getArticles() {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }
    db.all('SELECT id, title, link FROM articles', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = { initDB, saveArticle, getArticles };
