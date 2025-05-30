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
      embedding TEXT,
      image TEXT,
      published TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      options TEXT,
      last_fetched TEXT
    )`);
  });
}

function saveArticle(title, link, embedding, image, published) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }
    const embStr = embedding ? JSON.stringify(embedding) : null;
    db.run(
      'INSERT OR IGNORE INTO articles (title, link, embedding, image, published) VALUES (?, ?, ?, ?, ?)',
      [title, link, embStr, image || null, published || new Date().toISOString()],
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
      'SELECT id, title, link, embedding, image, published FROM articles WHERE link = ?',
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
    db.all('SELECT id, title, link, embedding, image, published FROM articles', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function addFeed(url, options = {}, lastFetched = null) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }
    const optStr = options ? JSON.stringify(options) : null;
    db.run(
      'INSERT INTO feeds (url, options, last_fetched) VALUES (?, ?, ?)',
      [url, optStr, lastFetched],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      },
    );
  });
}

function getFeeds() {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }
    db.all('SELECT id, url, options, last_fetched FROM feeds', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function updateFeed(id, { url, options, lastFetched } = {}) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }
    const fields = [];
    const params = [];
    if (url !== undefined) {
      fields.push('url = ?');
      params.push(url);
    }
    if (options !== undefined) {
      fields.push('options = ?');
      params.push(options ? JSON.stringify(options) : null);
    }
    if (lastFetched !== undefined) {
      fields.push('last_fetched = ?');
      params.push(lastFetched);
    }
    if (fields.length === 0) {
      resolve(0);
      return;
    }
    params.push(id);
    db.run(`UPDATE feeds SET ${fields.join(', ')} WHERE id = ?`, params, function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

function deleteFeed(id) {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error('Database not initialized'));
    }
    db.run('DELETE FROM feeds WHERE id = ?', [id], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

function closeDB() {
  if (db) {
    db.close();
    db = null;
  }
}


module.exports = {
  initDB,
  saveArticle,
  getArticles,
  getArticleByLink,
  addFeed,
  getFeeds,
  updateFeed,
  deleteFeed,
  closeDB,
};

