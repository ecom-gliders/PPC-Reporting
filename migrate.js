require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
  changes: 'changes.json',
  summaries: 'summaries.json',
  users: 'users.json',
  clients: 'clients.json',
  settings: 'settings.json',
  daily_context: 'daily_context.json',
};

async function migrate() {
  await pool.query('CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, value JSONB NOT NULL)');

  for (const [key, file] of Object.entries(FILES)) {
    const filePath = path.join(DATA_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`Skipping "${key}" — ${file} not found`);
      continue;
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    await pool.query('INSERT INTO kv_store (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, JSON.stringify(data)]);
    console.log(`Migrated "${key}" (${Array.isArray(data) ? data.length + ' items' : 'object'})`);
  }

  await pool.end();
  console.log('Migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
