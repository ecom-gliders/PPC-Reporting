const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const CHANGES_FILE = path.join(DATA_DIR, 'changes.json');
const SUMMARIES_FILE = path.join(DATA_DIR, 'summaries.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CLIENTS_FILE = path.join(DATA_DIR, 'clients.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const DAILY_CONTEXT_FILE = path.join(DATA_DIR, 'daily_context.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(CHANGES_FILE)) fs.writeFileSync(CHANGES_FILE, '[]');
if (!fs.existsSync(SUMMARIES_FILE)) fs.writeFileSync(SUMMARIES_FILE, '[]');
if (!fs.existsSync(CLIENTS_FILE)) fs.writeFileSync(CLIENTS_FILE, '[]');
if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, '{}');
if (!fs.existsSync(DAILY_CONTEXT_FILE)) fs.writeFileSync(DAILY_CONTEXT_FILE, '[]');

if (!fs.existsSync(USERS_FILE)) {
  const defaultAdmin = {
    id: crypto.randomUUID(),
    username: 'admin',
    passwordHash: bcrypt.hashSync('admin123', 10),
    role: 'admin',
    clientIds: [],
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(USERS_FILE, JSON.stringify([defaultAdmin], null, 2));
  console.log('Created default admin user -> username: admin / password: admin123 (please change this!)');
}

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

module.exports = {
  getChanges: () => readJSON(CHANGES_FILE),
  saveChanges: (data) => writeJSON(CHANGES_FILE, data),
  getSummaries: () => readJSON(SUMMARIES_FILE),
  saveSummaries: (data) => writeJSON(SUMMARIES_FILE, data),
  getUsers: () => readJSON(USERS_FILE),
  saveUsers: (data) => writeJSON(USERS_FILE, data),
  getClients: () => readJSON(CLIENTS_FILE),
  saveClients: (data) => writeJSON(CLIENTS_FILE, data),
  getSettings: () => readJSON(SETTINGS_FILE),
  saveSettings: (data) => writeJSON(SETTINGS_FILE, data),
  getDailyContexts: () => readJSON(DAILY_CONTEXT_FILE),
  saveDailyContexts: (data) => writeJSON(DAILY_CONTEXT_FILE, data),
};
