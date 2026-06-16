require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const cron = require('node-cron');
const crypto = require('crypto');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');

const db = require('./db');
const { parseCsv } = require('./parser');
const { generateWeeklySummary } = require('./summary');
const { sendWeeklyReportEmail } = require('./email');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

if (!process.env.SESSION_SECRET) {
  console.warn('WARNING: SESSION_SECRET env var not set — using an insecure default. Set SESSION_SECRET in .env for production.');
}

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(
  session({
    store: new pgSession({ pool: db.pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'ppc-change-history-secret',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  })
);

// ---- Auth middleware ----
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
  return res.redirect('/login.html');
}
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Admin access required' });
  return res.redirect('/');
}

// Returns the list of client IDs the current session user may access (admin = all)
function accessibleClientIds(sessionUser) {
  const clients = db.getClients();
  if (sessionUser.role === 'admin') return clients.map((c) => c.id);
  const dbUser = db.getUsers().find((u) => u.id === sessionUser.id);
  return (dbUser && dbUser.clientIds) || [];
}

// Ensures req.query.clientId / req.body.clientId is provided and accessible to the user
function requireClientAccess(req, res, next) {
  const clientId = req.query.clientId || (req.body && req.body.clientId);
  if (!clientId) return res.status(400).json({ error: 'clientId is required' });
  const allowed = accessibleClientIds(req.session.user);
  if (!allowed.includes(clientId)) return res.status(403).json({ error: 'You do not have access to this client' });
  req.clientId = clientId;
  next();
}

// Blocks the read-only "client" role from performing write actions
function requireWriteAccess(req, res, next) {
  if (req.session.user.role === 'client') return res.status(403).json({ error: 'Your account has view-only access' });
  next();
}

// ---- Auth routes (public) ----
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const users = db.getUsers();
  const user = users.find((u) => u.username.toLowerCase() === String(username || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  if (user.enabled === false) {
    return res.status(403).json({ error: 'This account has been disabled. Contact your administrator.' });
  }
  if (user.role === 'client') {
    const client = db.getClients().find((c) => c.userId === user.id);
    if (client && client.enabled === false) {
      return res.status(403).json({ error: 'This account has been disabled. Contact your administrator.' });
    }
  }
  user.lastLogin = new Date().toISOString();
  db.saveUsers(users);

  req.session.user = { id: user.id, username: user.username, role: user.role };
  res.json({ ok: true, user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  res.json({ user: (req.session && req.session.user) || null });
});

// login page itself must be accessible without auth
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

// everything else requires login
app.use(requireAuth);
app.get('/admin.html', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/logs.html', requireAdmin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'logs.html')));
app.use(express.static(path.join(__dirname, 'public')));

// ================= ADMIN: UPLOAD LOGS =================
app.get('/api/upload-logs', requireAdmin, (req, res) => {
  const { clientId } = req.query;
  let logs = db.getUploadLogs();
  if (clientId) logs = logs.filter((l) => l.clientId === clientId);
  logs = logs.slice().sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  res.json(logs);
});

// ================= ADMIN: USER MANAGEMENT =================
app.get('/api/users', requireAdmin, (req, res) => {
  const users = db.getUsers()
    .filter((u) => u.role !== 'client') // client logins are managed via /api/clients
    .map((u) => ({
      id: u.id,
      username: u.username,
      password: u.password || null,
      role: u.role,
      clientIds: u.clientIds || [],
      enabled: u.enabled !== false,
      createdAt: u.createdAt,
      lastLogin: u.lastLogin || null,
    }));
  res.json(users);
});

// Reset a client's auto-generated login password
app.post('/api/clients/:id/reset-password', requireAdmin, (req, res) => {
  const clients = db.getClients();
  const client = clients.find((c) => c.id === req.params.id);
  if (!client || !client.userId) return res.status(404).json({ error: 'Client not found' });

  const users = db.getUsers();
  const clientUser = users.find((u) => u.id === client.userId);
  if (!clientUser) return res.status(404).json({ error: 'Client login not found' });

  const newPassword = crypto.randomBytes(4).toString('hex');
  clientUser.passwordHash = bcrypt.hashSync(newPassword, 10);
  db.saveUsers(users);

  client.loginPassword = newPassword;
  db.saveClients(clients);

  res.json({ ok: true, loginUsername: client.loginUsername, loginPassword: newPassword });
});

app.post('/api/users', requireAdmin, (req, res) => {
  const { username, password, role, clientIds } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Role must be admin or user' });

  const users = db.getUsers();
  if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const newUser = {
    id: crypto.randomUUID(),
    username,
    password,
    passwordHash: bcrypt.hashSync(password, 10),
    role,
    clientIds: Array.isArray(clientIds) ? clientIds : [],
    createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  db.saveUsers(users);
  res.json({ id: newUser.id, username: newUser.username, role: newUser.role, clientIds: newUser.clientIds, createdAt: newUser.createdAt });
});

// Update a user's client access (and optionally role)
app.put('/api/users/:id/access', requireAdmin, (req, res) => {
  const users = db.getUsers();
  const target = users.find((u) => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });

  const { clientIds, role } = req.body || {};
  if (Array.isArray(clientIds)) target.clientIds = clientIds;
  if (role && ['admin', 'user', 'client'].includes(role)) target.role = role;

  db.saveUsers(users);
  res.json({ id: target.id, username: target.username, role: target.role, clientIds: target.clientIds || [] });
});

// Enable or disable an employee/admin's login access
app.post('/api/users/:id/toggle-enabled', requireAdmin, (req, res) => {
  const users = db.getUsers();
  const target = users.find((u) => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.session.user.id) return res.status(400).json({ error: 'You cannot disable your own account' });

  const willBeEnabled = target.enabled === false ? true : false;
  if (!willBeEnabled && target.role === 'admin') {
    const otherActiveAdmins = users.filter((u) => u.role === 'admin' && u.id !== target.id && u.enabled !== false);
    if (otherActiveAdmins.length === 0) {
      return res.status(400).json({ error: 'Cannot disable the last remaining admin account' });
    }
  }

  target.enabled = willBeEnabled;
  db.saveUsers(users);
  res.json({ ok: true, enabled: target.enabled });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  let users = db.getUsers();
  const target = users.find((u) => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.id === req.session.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });

  if (target.role === 'admin') {
    const otherActiveAdmins = users.filter((u) => u.role === 'admin' && u.id !== target.id && u.enabled !== false);
    if (otherActiveAdmins.length === 0) {
      return res.status(400).json({ error: 'Cannot delete the last remaining admin account' });
    }
  }

  users = users.filter((u) => u.id !== req.params.id);
  db.saveUsers(users);
  res.json({ ok: true });
});

// ================= SETTINGS =================
app.get('/api/settings', requireAdmin, (req, res) => {
  const settings = db.getSettings();
  const key = settings.openaiApiKey || '';
  // mask the key so it isn't fully exposed once saved
  const masked = key ? `${key.slice(0, 3)}${'•'.repeat(10)}${key.slice(-4)}` : '';
  const smtpPass = settings.smtpPass || '';
  const resendKey = settings.resendApiKey || '';
  res.json({
    openaiApiKeySet: !!key,
    openaiApiKeyMasked: masked,
    smtpHost: settings.smtpHost || '',
    smtpPort: settings.smtpPort || '',
    smtpUser: settings.smtpUser || '',
    smtpFrom: settings.smtpFrom || '',
    smtpPassSet: !!smtpPass,
    smtpPassMasked: smtpPass ? '•'.repeat(10) : '',
    resendApiKeySet: !!resendKey,
    resendApiKeyMasked: resendKey ? `${resendKey.slice(0, 5)}${'•'.repeat(10)}${resendKey.slice(-4)}` : '',
  });
});

app.post('/api/settings', requireAdmin, (req, res) => {
  const { openaiApiKey, smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, resendApiKey } = req.body || {};

  const settings = db.getSettings();
  if (typeof openaiApiKey === 'string') settings.openaiApiKey = openaiApiKey.trim();
  if (typeof resendApiKey === 'string' && resendApiKey.trim()) settings.resendApiKey = resendApiKey.trim();
  if (typeof smtpHost === 'string') settings.smtpHost = smtpHost.trim();
  if (typeof smtpPort === 'string' || typeof smtpPort === 'number') settings.smtpPort = String(smtpPort).trim();
  if (typeof smtpUser === 'string') settings.smtpUser = smtpUser.trim();
  if (typeof smtpFrom === 'string') settings.smtpFrom = smtpFrom.trim();
  if (typeof smtpPass === 'string' && smtpPass.trim()) settings.smtpPass = smtpPass.trim();
  db.saveSettings(settings);
  res.json({ ok: true });
});

// ================= CLIENTS =================
// List clients visible to the current user (admin sees all)
app.get('/api/clients', (req, res) => {
  const allowed = new Set(accessibleClientIds(req.session.user));
  const clients = db.getClients().filter((c) => allowed.has(c.id));
  const isAdmin = req.session.user.role === 'admin';

  // attach per-client stats
  const changes = db.getChanges();
  const users = db.getUsers();
  const result = clients.map((c) => {
    const clientChanges = changes.filter((ch) => ch.clientId === c.id);
    const dates = new Set(clientChanges.map((ch) => ch.date));
    const asins = new Set(clientChanges.map((ch) => ch.asin));
    const clientUser = users.find((u) => u.id === c.userId);
    const stats = {
      ...c,
      totalChanges: clientChanges.length,
      totalDates: dates.size,
      totalAsins: asins.size,
      lastLogin: (clientUser && clientUser.lastLogin) || null,
    };
    if (!isAdmin) {
      delete stats.loginUsername;
      delete stats.loginPassword;
      delete stats.userId;
    }
    return stats;
  });
  res.json(result);
});

// generates a url/login friendly slug from a client name
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

app.post('/api/clients', requireAdmin, (req, res) => {
  const { name, email } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Client name is required' });
  const trimmedName = name.trim();

  const clients = db.getClients();
  const users = db.getUsers();

  const newClient = {
    id: crypto.randomUUID(),
    name: trimmedName,
    email: (email || '').trim(),
    createdAt: new Date().toISOString(),
  };

  // auto-create a view-only login for the client
  let loginUsername = `${slugify(trimmedName)}xecomgliders`;
  let suffix = 1;
  while (users.some((u) => u.username.toLowerCase() === loginUsername.toLowerCase())) {
    loginUsername = `${slugify(trimmedName)}${suffix}xecomgliders`;
    suffix++;
  }
  const loginPassword = crypto.randomBytes(4).toString('hex');

  const clientUser = {
    id: crypto.randomUUID(),
    username: loginUsername,
    passwordHash: bcrypt.hashSync(loginPassword, 10),
    role: 'client',
    clientIds: [newClient.id],
    createdAt: new Date().toISOString(),
  };
  users.push(clientUser);
  db.saveUsers(users);

  newClient.userId = clientUser.id;
  newClient.loginUsername = loginUsername;
  newClient.loginPassword = loginPassword;

  clients.push(newClient);
  db.saveClients(clients);
  res.json(newClient);
});

// Enable or disable a client's login access
app.post('/api/clients/:id/toggle-enabled', requireAdmin, (req, res) => {
  const clients = db.getClients();
  const client = clients.find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  client.enabled = client.enabled === false ? true : false;
  db.saveClients(clients);
  res.json({ ok: true, enabled: client.enabled });
});

// Update a client's notification email
app.put('/api/clients/:id/email', requireAdmin, (req, res) => {
  const { email } = req.body || {};
  if (typeof email !== 'string') return res.status(400).json({ error: 'email is required' });

  const clients = db.getClients();
  const client = clients.find((c) => c.id === req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  client.email = email.trim();
  db.saveClients(clients);
  res.json({ ok: true, email: client.email });
});

app.delete('/api/clients/:id', requireAdmin, (req, res) => {
  let clients = db.getClients();
  const target = clients.find((c) => c.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'Client not found' });
  clients = clients.filter((c) => c.id !== req.params.id);
  db.saveClients(clients);

  // remove client data
  db.saveChanges(db.getChanges().filter((c) => c.clientId !== req.params.id));
  db.saveSummaries(db.getSummaries().filter((s) => s.clientId !== req.params.id));
  db.saveDailyContexts(db.getDailyContexts().filter((d) => d.clientId !== req.params.id));

  // remove the client's auto-generated login, and unassign from other users
  let users = db.getUsers();
  if (target.userId) users = users.filter((u) => u.id !== target.userId);
  for (const u of users) {
    if (Array.isArray(u.clientIds)) u.clientIds = u.clientIds.filter((id) => id !== req.params.id);
  }
  db.saveUsers(users);

  res.json({ ok: true });
});

// ================= UPLOAD CSV =================
app.post('/api/upload', requireWriteAccess, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const clientId = req.body.clientId;
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });

    const context = (req.body.context || '').trim();
    if (!context) return res.status(400).json({ error: 'Context is required - is din ke changes ki wajah likhna zaroori hai.' });

    const allowed = accessibleClientIds(req.session.user);
    if (!allowed.includes(clientId)) return res.status(403).json({ error: 'You do not have access to this client' });

    const csvText = req.file.buffer.toString('utf-8');
    const parsedRows = parseCsv(csvText, req.file.originalname);

    const existing = db.getChanges();

    // de-duplicate by hash of key fields (so re-uploading same export is safe)
    const existingKeys = new Set(existing.map(rowKey));
    let added = 0;
    for (const row of parsedRows) {
      row.clientId = clientId;
      const key = rowKey(row);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      row.id = crypto.randomUUID();
      row.uploadedAt = new Date().toISOString();
      existing.push(row);
      added++;
    }

    db.saveChanges(existing);

    // Save the analyst's context note against every date covered by this upload
    const datesInUpload = [...new Set(parsedRows.map((r) => r.date))];
    if (datesInUpload.length) {
      const dailyContexts = db.getDailyContexts();
      const now = new Date().toISOString();
      for (const date of datesInUpload) {
        const existingEntry = dailyContexts.find((d) => d.clientId === clientId && d.date === date);
        if (existingEntry) {
          existingEntry.context = context;
          existingEntry.updatedAt = now;
        } else {
          dailyContexts.push({ id: crypto.randomUUID(), clientId, date, context, updatedAt: now });
        }
      }
      db.saveDailyContexts(dailyContexts);
    }

    const client = db.getClients().find((c) => c.id === clientId);
    const uploadLogs = db.getUploadLogs();
    uploadLogs.push({
      id: crypto.randomUUID(),
      clientId,
      clientName: client ? client.name : clientId,
      uploadedBy: req.session.user.username,
      fileName: req.file.originalname,
      context,
      datesInUpload,
      totalRows: parsedRows.length,
      added,
      skippedDuplicates: parsedRows.length - added,
      uploadedAt: new Date().toISOString(),
    });
    db.saveUploadLogs(uploadLogs);

    res.json({ ok: true, totalRows: parsedRows.length, added, skippedDuplicates: parsedRows.length - added });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

function rowKey(row) {
  return [row.clientId, row.asin, row.changeLevel, row.rawChangeType, row.from, row.to, row.datetime].join('|');
}

// ================= CHANGE DATA (per client) =================
app.get('/api/dates', requireClientAccess, (req, res) => {
  const changes = db.getChanges().filter((c) => c.clientId === req.clientId);
  const dates = [...new Set(changes.map((c) => c.date))].sort().reverse();
  res.json(dates);
});

app.get('/api/changes', requireClientAccess, (req, res) => {
  const { date, asin, from, to } = req.query;
  let changes = db.getChanges().filter((c) => c.clientId === req.clientId);

  if (date) changes = changes.filter((c) => c.date === date);
  if (from) changes = changes.filter((c) => c.date >= from);
  if (to) changes = changes.filter((c) => c.date <= to);
  if (asin) changes = changes.filter((c) => c.asin === asin);

  // group by ASIN
  const grouped = {};
  for (const c of changes) {
    if (!grouped[c.asin]) grouped[c.asin] = [];
    grouped[c.asin].push(c);
  }
  // sort each group by datetime desc
  for (const asinKey of Object.keys(grouped)) {
    grouped[asinKey].sort((a, b) => (a.datetime < b.datetime ? 1 : a.datetime > b.datetime ? -1 : 0));
  }

  res.json({ total: changes.length, asins: Object.keys(grouped).length, grouped });
});

app.get('/api/asins', requireClientAccess, (req, res) => {
  const { from, to } = req.query;
  let changes = db.getChanges().filter((c) => c.clientId === req.clientId);
  if (from) changes = changes.filter((c) => c.date >= from);
  if (to) changes = changes.filter((c) => c.date <= to);
  const counts = {};
  for (const c of changes) counts[c.asin] = (counts[c.asin] || 0) + 1;
  const result = Object.entries(counts)
    .map(([asin, count]) => ({ asin, count }))
    .sort((a, b) => b.count - a.count);
  res.json(result);
});

app.get('/api/stats', requireClientAccess, (req, res) => {
  const changes = db.getChanges().filter((c) => c.clientId === req.clientId);
  const dates = [...new Set(changes.map((c) => c.date))];
  const asins = [...new Set(changes.map((c) => c.asin))];
  res.json({ totalChanges: changes.length, totalDates: dates.length, totalAsins: asins.length });
});

function buildAnalytics(allChanges, clientId, from, to) {
  let changes = allChanges.filter((c) => c.clientId === clientId);
  if (from) changes = changes.filter((c) => c.date >= from);
  if (to) changes = changes.filter((c) => c.date <= to);

  // Activity over time (changes per date)
  const byDate = {};
  for (const c of changes) byDate[c.date] = (byDate[c.date] || 0) + 1;
  const activityOverTime = Object.entries(byDate).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, count]) => ({ date, count }));

  // Action type breakdown
  const byAction = {};
  for (const c of changes) byAction[c.action] = (byAction[c.action] || 0) + 1;
  const actionBreakdown = Object.entries(byAction).map(([action, count]) => ({ action, count }));

  // Bid increases vs decreases
  let bidIncreases = 0;
  let bidDecreases = 0;
  for (const c of changes) {
    if (!c.action.toLowerCase().includes('bid')) continue;
    const from = parseFloat(String(c.from).replace(/[^0-9.-]/g, ''));
    const to = parseFloat(String(c.to).replace(/[^0-9.-]/g, ''));
    if (Number.isNaN(from) || Number.isNaN(to)) continue;
    if (to > from) bidIncreases++;
    else if (to < from) bidDecreases++;
  }

  // Top ASINs by activity
  const byAsin = {};
  for (const c of changes) byAsin[c.asin] = (byAsin[c.asin] || 0) + 1;
  const topAsins = Object.entries(byAsin)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([asin, count]) => ({ asin, count }));

  // Campaigns paused over time
  const byPauseDate = {};
  for (const c of changes) {
    if (c.action === 'Campaign Status' && String(c.to).toLowerCase() === 'paused') {
      byPauseDate[c.date] = (byPauseDate[c.date] || 0) + 1;
    }
  }
  const campaignsPaused = Object.entries(byPauseDate).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, count]) => ({ date, count }));

  return { totalChanges: changes.length, activityOverTime, actionBreakdown, bidIncreases, bidDecreases, topAsins, campaignsPaused };
}

app.get('/api/analytics', requireClientAccess, (req, res) => {
  const { from, to, compareFrom, compareTo } = req.query;
  const allChanges = db.getChanges();
  const result = buildAnalytics(allChanges, req.clientId, from, to);

  if (compareFrom && compareTo) {
    result.compare = buildAnalytics(allChanges, req.clientId, compareFrom, compareTo);
  }

  res.json(result);
});

// ================= SUMMARIES (per client) =================
app.get('/api/summaries', requireClientAccess, (req, res) => {
  const summaries = db.getSummaries().filter((s) => s.clientId === req.clientId);
  res.json(summaries.sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : a.generatedAt > b.generatedAt ? -1 : 0)));
});

// Records an AI summary generation event in the upload logs
function logSummaryGeneration(clientId, summary, triggeredBy) {
  const client = db.getClients().find((c) => c.id === clientId);
  const uploadLogs = db.getUploadLogs();
  uploadLogs.push({
    id: crypto.randomUUID(),
    type: 'summary',
    clientId,
    clientName: client ? client.name : clientId,
    uploadedBy: triggeredBy,
    fileName: `AI Summary (${summary.from} to ${summary.to})`,
    context: `${summary.totalChanges} changes analyzed across ${summary.asinCount} ASINs`,
    totalRows: summary.totalChanges,
    added: summary.asinCount,
    skippedDuplicates: 0,
    uploadedAt: summary.generatedAt,
  });
  db.saveUploadLogs(uploadLogs);
}

app.post('/api/summaries/:id/send-email', requireAdmin, async (req, res) => {
  const summary = db.getSummaries().find((s) => s.id === req.params.id);
  if (!summary) return res.status(404).json({ error: 'Summary not found' });
  try {
    await emailWeeklyReport(summary.clientId, summary);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/summaries/generate', requireClientAccess, requireAdmin, async (req, res) => {
  try {
    const { from, to, context } = req.body || {};
    const summary = await generateWeeklySummary({ clientId: req.clientId, from, to, context });
    logSummaryGeneration(req.clientId, summary, req.session.user.username);
    await emailWeeklyReport(req.clientId, summary);
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Emails the weekly report to a client's notification address, if configured
const APP_URL = process.env.APP_URL || 'https://ppc-reporting.onrender.com';
async function emailWeeklyReport(clientId, summary) {
  const client = db.getClients().find((c) => c.id === clientId);
  if (!client || !client.email) return;
  try {
    await sendWeeklyReportEmail({
      to: client.email,
      clientName: client.name,
      from: summary.from,
      to: summary.to,
      totalChanges: summary.totalChanges,
      asinCount: summary.asinCount,
      reportUrl: `${APP_URL}/dashboard.html?clientId=${clientId}&tab=summary`,
    });
  } catch (err) {
    console.error(`[email] Failed to send weekly report to ${client.email}:`, err.message);
  }
}

// ================= UTILITY =================
// Test SMTP connection and send a test email
app.post('/api/test-email', requireAdmin, async (req, res) => {
  const { Resend } = require('resend');
  const settings = db.getSettings();
  const apiKey = (settings.resendApiKey || process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return res.status(400).json({ error: 'Resend API key not configured' });
  try {
    const resend = new Resend(apiKey);
    const to = (req.body && req.body.to) || 'info@ecomgliders.com';
    const result = await resend.emails.send({
      from: 'PPC Reports <ppcreporting@ecomgliders.com>',
      to,
      subject: 'PPC Dashboard — Email Test ✅',
      html: '<p>Email delivery is working correctly from the EcomGliders PPC Dashboard.</p>',
    });
    res.json({ ok: true, sentTo: to, id: result.data?.id, error: result.error });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete all change data for a client
app.delete('/api/changes', requireClientAccess, requireWriteAccess, (req, res) => {
  db.saveChanges(db.getChanges().filter((c) => c.clientId !== req.clientId));
  res.json({ ok: true });
});

// ---- Cron: every Saturday at 02:00, summarize the past 7 days for every client ----
cron.schedule('0 2 * * 6', async () => {
  console.log('[cron] Generating weekly PPC summaries for all clients...');
  const clients = db.getClients();
  for (const client of clients) {
    try {
      const summary = await generateWeeklySummary({ clientId: client.id });
      logSummaryGeneration(client.id, summary, 'Automated (cron)');
      await emailWeeklyReport(client.id, summary);
      console.log(`[cron] Weekly summary generated for client "${client.name}".`);
    } catch (err) {
      console.error(`[cron] Failed to generate weekly summary for client "${client.name}":`, err.message);
    }
  }
});

const PORT = process.env.PORT || 3000;
db.ready
  .then(() => {
    app.listen(PORT, () => console.log(`PPC Change History app running at http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to connect to database:', err.message);
    process.exit(1);
  });
