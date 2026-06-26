const path = require('path');
const fs = require('fs');

const DB_TYPE = process.env.DB_TYPE || 'sqlite';

let db;

const SCHEMA_SQLITE = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT 'Basliksiz Not',
    content TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#ffffff',
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`;

const SCHEMA_PG = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS notes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL DEFAULT 'Basliksiz Not',
    content TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#ffffff',
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );
`;

async function initialize() {
  if (DB_TYPE === 'postgres') {
    const { Pool } = require('pg');
    db = new Pool({ connectionString: process.env.DATABASE_URL });
    await db.query(SCHEMA_PG);
    console.log('  PostgreSQL baglantisi kuruldu');
  } else {
    const Database = require('better-sqlite3');
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const dbPath = process.env.SQLITE_PATH || path.join(dataDir, 'notes.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(SCHEMA_SQLITE);
    console.log('  SQLite veritabani: ' + dbPath);
  }
}

function isPg() { return DB_TYPE === 'postgres'; }

async function query(sql, params = []) {
  if (isPg()) {
    let pgSql = sql;
    let i = 1;
    pgSql = pgSql.replace(/\?/g, () => '$' + (i++));
    const result = await db.query(pgSql, params);
    return result.rows;
  } else {
    return db.prepare(sql).all(...params);
  }
}

async function run(sql, params = []) {
  if (isPg()) {
    let pgSql = sql;
    let i = 1;
    pgSql = pgSql.replace(/\?/g, () => '$' + (i++));
    const result = await db.query(pgSql + ' RETURNING *', params);
    return result.rows[0];
  } else {
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
  }
}

async function getOne(sql, params = []) {
  if (isPg()) {
    let pgSql = sql;
    let i = 1;
    pgSql = pgSql.replace(/\?/g, () => '$' + (i++));
    const result = await db.query(pgSql, params);
    return result.rows[0] || null;
  } else {
    return db.prepare(sql).get(...params) || null;
  }
}

module.exports = {
  initialize,

  async createUser(username, passwordHash) {
    await run('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
  },

  async getUserByUsername(username) {
    return getOne('SELECT * FROM users WHERE username = ?', [username]);
  },

  async getUserById(id) {
    return getOne('SELECT * FROM users WHERE id = ?', [id]);
  },

  async updatePassword(userId, hash) {
    await run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId]);
  },

  async getAllNotes(userId) {
    const orderBy = isPg() ? 'pinned DESC, updated_at DESC' : 'pinned DESC, updated_at DESC';
    return query('SELECT * FROM notes WHERE user_id = ? ORDER BY ' + orderBy, [userId]);
  },

  async getNoteById(id, userId) {
    return getOne('SELECT * FROM notes WHERE id = ? AND user_id = ?', [id, userId]);
  },

  async createNote(userId, title, content, color) {
    if (isPg()) {
      return run('INSERT INTO notes (user_id, title, content, color) VALUES (?, ?, ?, ?)', [userId, title, content, color]);
    } else {
      const result = await run('INSERT INTO notes (user_id, title, content, color) VALUES (?, ?, ?, ?)', [userId, title, content, color]);
      return getOne('SELECT * FROM notes WHERE id = ?', [result.lastInsertRowid]);
    }
  },

  async updateNote(id, userId, { title, content, color, pinned }) {
    const existing = await getOne('SELECT * FROM notes WHERE id = ? AND user_id = ?', [id, userId]);
    if (!existing) return null;

    const newTitle = title !== undefined ? title : existing.title;
    const newContent = content !== undefined ? content : existing.content;
    const newColor = color !== undefined ? color : existing.color;
    const newPinned = pinned !== undefined ? (isPg() ? pinned : (pinned ? 1 : 0)) : existing.pinned;

    if (isPg()) {
      return run('UPDATE notes SET title = ?, content = ?, color = ?, pinned = ?, updated_at = NOW() WHERE id = ? AND user_id = ?',
        [newTitle, newContent, newColor, newPinned, id, userId]);
    } else {
      await run("UPDATE notes SET title = ?, content = ?, color = ?, pinned = ?, updated_at = datetime('now','localtime') WHERE id = ? AND user_id = ?",
        [newTitle, newContent, newColor, newPinned, id, userId]);
      return getOne('SELECT * FROM notes WHERE id = ?', [id]);
    }
  },

  async deleteNote(id, userId) {
    if (isPg()) {
      const result = await db.query('DELETE FROM notes WHERE id = $1 AND user_id = $2', [id, userId]);
      return result.rowCount > 0;
    } else {
      const result = db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, userId);
      return result.changes > 0;
    }
  },

  async searchNotes(userId, searchQuery) {
    const q = '%' + searchQuery + '%';
    const orderBy = isPg() ? 'pinned DESC, updated_at DESC' : 'pinned DESC, updated_at DESC';
    return query('SELECT * FROM notes WHERE user_id = ? AND (title LIKE ? OR content LIKE ?) ORDER BY ' + orderBy, [userId, q, q]);
  }
};
