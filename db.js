const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const KEYS = ['changes', 'summaries', 'users', 'clients', 'settings', 'daily_context'];

const cache = {
  changes: [],
  summaries: [],
  users: [],
  clients: [],
  settings: {},
  daily_context: [],
};

function save(key, data) {
  cache[key] = data;
  pool
    .query('INSERT INTO kv_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, JSON.stringify(data)])
    .catch((err) => console.error(`Failed to save "${key}" to database:`, err.message));
}

async function init() {
  await pool.query('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value JSONB NOT NULL)');

  const { rows } = await pool.query('SELECT key, value FROM kv_store WHERE key = ANY($1)', [KEYS]);
  const loaded = new Set();
  for (const row of rows) {
    cache[row.key] = row.value;
    loaded.add(row.key);
  }

  if (!loaded.has('users')) {
    const defaultAdmin = {
      id: crypto.randomUUID(),
      username: 'admin',
      passwordHash: bcrypt.hashSync('admin123', 10),
      role: 'admin',
      clientIds: [],
      createdAt: new Date().toISOString(),
    };
    cache.users = [defaultAdmin];
    save('users', cache.users);
    console.log('Created default admin user -> username: admin / password: admin123 (please change this!)');
  }

  for (const key of KEYS) {
    if (!loaded.has(key) && key !== 'users') {
      save(key, cache[key]);
    }
  }
}

const ready = init();

module.exports = {
  pool,
  ready,
  getChanges: () => cache.changes,
  saveChanges: (data) => save('changes', data),
  getSummaries: () => cache.summaries,
  saveSummaries: (data) => save('summaries', data),
  getUsers: () => cache.users,
  saveUsers: (data) => save('users', data),
  getClients: () => cache.clients,
  saveClients: (data) => save('clients', data),
  getSettings: () => cache.settings,
  saveSettings: (data) => save('settings', data),
  getDailyContexts: () => cache.daily_context,
  saveDailyContexts: (data) => save('daily_context', data),
};
