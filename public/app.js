const CLIENT_ID = new URLSearchParams(window.location.search).get('clientId');
if (!CLIENT_ID) {
  window.location.href = '/clients.html';
  throw new Error('Redirecting to client selection — no clientId in URL.');
}
const cq = (extra = '') => `clientId=${encodeURIComponent(CLIENT_ID)}${extra}`;

document.getElementById('overviewLink').href = `/overview.html?clientId=${encodeURIComponent(CLIENT_ID)}`;

const levelColors = {
  Campaign: 'bg-indigo-600',
  'Ad Group': 'bg-sky-600',
  Keyword: 'bg-emerald-600',
  Other: 'bg-slate-500',
};

const actionColors = {
  'Negative Keyword': 'border-rose-500 text-rose-700 bg-rose-50',
  'Keyword Bid': 'border-emerald-500 text-emerald-700 bg-emerald-50',
  'Keyword Status': 'border-emerald-600 text-emerald-800 bg-emerald-50',
  'Keyword Added': 'border-teal-500 text-teal-700 bg-teal-50',
  'Campaign Status': 'border-indigo-500 text-indigo-700 bg-indigo-50',
  Budget: 'border-amber-500 text-amber-800 bg-amber-50',
  'Bid Adjustment': 'border-violet-500 text-violet-700 bg-violet-50',
  'Targeting Bid': 'border-cyan-500 text-cyan-700 bg-cyan-50',
  'Targeting Status': 'border-cyan-600 text-cyan-800 bg-cyan-50',
  'Category Target Bid': 'border-fuchsia-500 text-fuchsia-700 bg-fuchsia-50',
  'Product Status': 'border-orange-500 text-orange-700 bg-orange-50',
};

function actionBadge(action) {
  const cls = actionColors[action] || 'border-slate-400 text-slate-700 bg-slate-50';
  return `<span class="inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-md border-l-[3px] ${cls}">${escapeHtml(action)}</span>`;
}

function levelBadge(level) {
  const dot = levelColors[level] || levelColors.Other;
  return `<span class="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-600"><span class="w-1.5 h-1.5 rounded-full ${dot}"></span>${escapeHtml(level)}</span>`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fromToBadge(from, to) {
  if (!from && !to) return '';
  const arrow = `<span class="text-slate-400 mx-1">→</span>`;
  return `<span class="font-mono text-xs"><span class="text-rose-600 line-through">${escapeHtml(from)}</span>${arrow}<span class="text-emerald-600 font-semibold">${escapeHtml(to)}</span></span>`;
}

function shortName(changeLevel, asin) {
  // Try to extract a human friendly suffix after the ASIN
  let s = changeLevel;
  const idx = s.indexOf(asin);
  if (idx !== -1) {
    s = s.slice(idx + asin.length).replace(/^[\s-]+/, '');
  }
  return s || changeLevel;
}

// ---------------- TABS ----------------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => {
      b.classList.remove('bg-white', 'shadow-sm', 'text-orange-600');
      b.classList.add('text-slate-500');
    });
    btn.classList.add('bg-white', 'shadow-sm', 'text-orange-600');
    btn.classList.remove('text-slate-500');

    document.querySelectorAll('[id^="tab-"]').forEach((sec) => sec.classList.add('hidden'));
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');

    if (btn.dataset.tab === 'asin') loadAsinList();
    if (btn.dataset.tab === 'summary') loadSummaries();
    if (btn.dataset.tab === 'graphs') loadGraphs();
  });
});

// ---------------- UPLOAD ----------------
let pendingUploadFile = null;

document.getElementById('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  pendingUploadFile = file;
  document.getElementById('uploadContextFileName').textContent = file.name;
  document.getElementById('uploadContextInput').value = '';
  document.getElementById('uploadContextError').classList.add('hidden');
  document.getElementById('uploadContextModal').classList.remove('hidden');
});

document.getElementById('uploadContextCancel').addEventListener('click', () => {
  document.getElementById('uploadContextModal').classList.add('hidden');
  document.getElementById('fileInput').value = '';
  pendingUploadFile = null;
});

document.getElementById('uploadContextSubmit').addEventListener('click', async () => {
  const context = document.getElementById('uploadContextInput').value.trim();
  if (!context) {
    document.getElementById('uploadContextError').classList.remove('hidden');
    return;
  }

  const file = pendingUploadFile;
  document.getElementById('uploadContextModal').classList.add('hidden');

  const toast = document.getElementById('uploadToast');
  toast.classList.remove('hidden');
  toast.innerHTML = `<div class="bg-blue-50 border border-blue-200 text-blue-700 text-sm px-4 py-3 rounded-lg">Uploading & parsing <strong>${escapeHtml(file.name)}</strong>...</div>`;

  const fd = new FormData();
  fd.append('file', file);
  fd.append('clientId', CLIENT_ID);
  fd.append('context', context);
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    toast.innerHTML = `<div class="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-lg">
      ✅ Uploaded <strong>${escapeHtml(file.name)}</strong> — ${data.totalRows} rows parsed, <strong>${data.added}</strong> new changes added${data.skippedDuplicates ? `, ${data.skippedDuplicates} duplicates skipped` : ''}.
    </div>`;
    await refreshAll();
  } catch (err) {
    toast.innerHTML = `<div class="bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3 rounded-lg">❌ ${escapeHtml(err.message)}</div>`;
  } finally {
    document.getElementById('fileInput').value = '';
    pendingUploadFile = null;
  }
});

// ---------------- STATS ----------------
async function loadStats() {
  const [stats, summaries] = await Promise.all([
    fetch(`/api/stats?${cq()}`).then((r) => r.json()),
    fetch(`/api/summaries?${cq()}`).then((r) => r.json()),
  ]);
  document.getElementById('statTotal').textContent = stats.totalChanges.toLocaleString();
  document.getElementById('statAsins').textContent = stats.totalAsins;
  document.getElementById('statDates').textContent = stats.totalDates;
  document.getElementById('statSummaries').textContent = summaries.length;
}

// ---------------- GRAPHS TAB ----------------
const chartPalette = ['#f97316', '#0ea5e9', '#8b5cf6', '#10b981', '#ec4899', '#6366f1', '#f59e0b', '#14b8a6', '#ef4444', '#84cc16'];
let dashboardCharts = {};

function destroyDashboardCharts() {
  Object.values(dashboardCharts).forEach((c) => c && c.destroy());
  dashboardCharts = {};
}

async function loadGraphs() {
  const from = document.getElementById('graphFromDate').value;
  const to = document.getElementById('graphToDate').value;
  let url = `/api/analytics?${cq()}`;
  if (from) url += `&from=${from}`;
  if (to) url += `&to=${to}`;
  const data = await fetch(url).then((r) => r.json());

  destroyDashboardCharts();

  dashboardCharts.activity = new Chart(document.getElementById('chartActivity'), {
    type: 'line',
    data: {
      labels: data.activityOverTime.map((d) => d.date),
      datasets: [{
        label: 'Changes',
        data: data.activityOverTime.map((d) => d.count),
        borderColor: '#f97316',
        backgroundColor: 'rgba(249,115,22,0.1)',
        fill: true,
        tension: 0.3,
      }],
    },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });

  dashboardCharts.actionBreakdown = new Chart(document.getElementById('chartActionBreakdown'), {
    type: 'pie',
    data: {
      labels: data.actionBreakdown.map((d) => d.action),
      datasets: [{
        data: data.actionBreakdown.map((d) => d.count),
        backgroundColor: data.actionBreakdown.map((_, i) => chartPalette[i % chartPalette.length]),
      }],
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });

  dashboardCharts.bids = new Chart(document.getElementById('chartBids'), {
    type: 'bar',
    data: {
      labels: ['Bid Increases', 'Bid Decreases'],
      datasets: [{
        data: [data.bidIncreases, data.bidDecreases],
        backgroundColor: ['#10b981', '#ef4444'],
      }],
    },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });

  dashboardCharts.topAsins = new Chart(document.getElementById('chartTopAsins'), {
    type: 'bar',
    data: {
      labels: data.topAsins.map((d) => d.asin),
      datasets: [{
        label: 'Changes',
        data: data.topAsins.map((d) => d.count),
        backgroundColor: '#0ea5e9',
      }],
    },
    options: { responsive: true, indexAxis: 'y', plugins: { legend: { display: false } } },
  });

  dashboardCharts.campaignsPaused = new Chart(document.getElementById('chartCampaignsPaused'), {
    type: 'bar',
    data: {
      labels: data.campaignsPaused.map((d) => d.date),
      datasets: [{
        label: 'Campaigns Paused',
        data: data.campaignsPaused.map((d) => d.count),
        backgroundColor: '#8b5cf6',
      }],
    },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });
}

document.getElementById('graphApplyFilterBtn').addEventListener('click', loadGraphs);
document.getElementById('graphClearFilterBtn').addEventListener('click', () => {
  document.getElementById('graphFromDate').value = '';
  document.getElementById('graphToDate').value = '';
  loadGraphs();
});

// ---------------- DAILY TAB ----------------
let availableDates = [];

async function loadDates() {
  availableDates = await fetch(`/api/dates?${cq()}`).then((r) => r.json());
  const sel = document.getElementById('dateSelect');
  sel.innerHTML = availableDates.map((d) => `<option value="${d}">${formatDate(d)}</option>`).join('');
  if (availableDates.length) {
    sel.value = availableDates[0];
    loadDailyChanges(availableDates[0]);
  } else {
    document.getElementById('dailyContainer').innerHTML = `<p class="text-slate-400 text-sm">No data uploaded yet. Upload a Change History CSV to get started.</p>`;
  }
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

document.getElementById('dateSelect').addEventListener('change', (e) => loadDailyChanges(e.target.value));

async function loadDailyChanges(date) {
  const container = document.getElementById('dailyContainer');
  container.innerHTML = `<p class="text-slate-400 text-sm">Loading...</p>`;
  const data = await fetch(`/api/changes?date=${date}&${cq()}`).then((r) => r.json());
  document.getElementById('dailyMeta').textContent = `${data.total} changes across ${data.asins} ASIN${data.asins === 1 ? '' : 's'}`;

  if (data.total === 0) {
    container.innerHTML = `<p class="text-slate-400 text-sm">No changes recorded on this date.</p>`;
    return;
  }

  const entries = Object.entries(data.grouped).sort((a, b) => {
    if (a[0] === 'UNASSIGNED') return 1;
    if (b[0] === 'UNASSIGNED') return -1;
    return b[1].length - a[1].length;
  });
  container.innerHTML = entries
    .map(([asin, rows]) => {
      const rowsHtml = rows
        .map(
          (r, i) => `
        <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} hover:bg-orange-50/70 transition-colors">
          <td class="py-2.5 px-4 text-xs text-slate-500 whitespace-nowrap font-mono border-b border-slate-100">${r.datetime.split(' ')[1] || ''}</td>
          <td class="py-2.5 px-4 whitespace-nowrap border-b border-slate-100">${levelBadge(r.level)}</td>
          <td class="py-2.5 px-4 whitespace-nowrap border-b border-slate-100">${actionBadge(r.action)}</td>
          <td class="py-2.5 px-4 text-sm text-slate-700 border-b border-slate-100 max-w-sm truncate" title="${escapeHtml(shortName(r.changeLevel, r.asin))}">${escapeHtml(shortName(r.changeLevel, r.asin))}</td>
          <td class="py-2.5 px-4 whitespace-nowrap border-b border-slate-100">${fromToBadge(r.from, r.to)}</td>
        </tr>`
        )
        .join('');

      return `
      <div class="bg-white rounded-2xl border-2 border-slate-300 shadow-sm overflow-hidden fade-in">
        <div class="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200">
          <div class="flex items-center gap-3">
            <span class="font-mono text-sm font-bold text-slate-800 tracking-wide">${escapeHtml(asin)}</span>
            <span class="text-[11px] font-semibold text-orange-600 bg-orange-50 ring-1 ring-orange-200 rounded-full px-2.5 py-0.5">${rows.length} change${rows.length === 1 ? '' : 's'}</span>
          </div>
          <a href="https://www.amazon.com/dp/${encodeURIComponent(asin)}" target="_blank" class="text-xs font-medium text-orange-600 hover:text-orange-700 hover:underline ${asin === 'UNASSIGNED' ? 'hidden' : ''}">View on Amazon ↗</a>
        </div>
        <div class="overflow-x-auto scrollbar-thin">
          <table class="w-full text-left border-collapse min-w-[700px] table-fixed">
            <colgroup>
              <col class="w-[80px]" />
              <col class="w-[110px]" />
              <col class="w-[140px]" />
              <col />
              <col class="w-[220px]" />
            </colgroup>
            <thead>
              <tr class="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50">
                <th class="py-2.5 px-4 font-semibold border-b border-slate-200">Time</th>
                <th class="py-2.5 px-4 font-semibold border-b border-slate-200">Level</th>
                <th class="py-2.5 px-4 font-semibold border-b border-slate-200">Change Type</th>
                <th class="py-2.5 px-4 font-semibold border-b border-slate-200">Target</th>
                <th class="py-2.5 px-4 font-semibold border-b border-slate-200">From → To</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>`;
    })
    .join('');
}

// ---------------- ASIN TAB ----------------
async function loadAsinList() {
  let asins = await fetch(`/api/asins?${cq()}`).then((r) => r.json());
  asins = asins.sort((a, b) => {
    if (a.asin === 'UNASSIGNED') return 1;
    if (b.asin === 'UNASSIGNED') return -1;
    return b.count - a.count;
  });
  const list = document.getElementById('asinList');
  if (!asins.length) {
    list.innerHTML = `<p class="text-slate-400 text-sm p-4">No data yet.</p>`;
    return;
  }
  list.innerHTML = asins
    .map(
      (a) => `
    <button class="asin-item w-full text-left px-4 py-3 hover:bg-orange-50 transition flex items-center justify-between" data-asin="${a.asin}">
      <span class="font-mono text-sm font-semibold text-slate-700">${a.asin}</span>
      <span class="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">${a.count}</span>
    </button>`
    )
    .join('');

  list.querySelectorAll('.asin-item').forEach((btn) =>
    btn.addEventListener('click', () => {
      list.querySelectorAll('.asin-item').forEach((b) => b.classList.remove('bg-orange-50'));
      btn.classList.add('bg-orange-50');
      loadAsinTimeline(btn.dataset.asin);
    })
  );
}

async function loadAsinTimeline(asin) {
  const container = document.getElementById('asinTimeline');
  container.innerHTML = `<p class="text-slate-400 text-sm">Loading...</p>`;
  const data = await fetch(`/api/changes?asin=${encodeURIComponent(asin)}&${cq()}`).then((r) => r.json());
  const rows = data.grouped[asin] || [];

  if (!rows.length) {
    container.innerHTML = `<p class="text-slate-400 text-sm">No changes found.</p>`;
    return;
  }

  // group by date
  const byDate = {};
  for (const r of rows) {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  }

  container.innerHTML = Object.entries(byDate)
    .map(([date, items]) => {
      const rowsHtml = items
        .map(
          (r, i) => `
        <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} hover:bg-orange-50/70 transition-colors">
          <td class="py-2.5 px-4 text-xs text-slate-500 whitespace-nowrap font-mono border-b border-slate-100">${r.datetime.split(' ')[1] || ''}</td>
          <td class="py-2.5 px-4 whitespace-nowrap border-b border-slate-100">${levelBadge(r.level)}</td>
          <td class="py-2.5 px-4 whitespace-nowrap border-b border-slate-100">${actionBadge(r.action)}</td>
          <td class="py-2.5 px-4 text-sm text-slate-700 border-b border-slate-100 max-w-sm truncate" title="${escapeHtml(shortName(r.changeLevel, r.asin))}">${escapeHtml(shortName(r.changeLevel, r.asin))}</td>
          <td class="py-2.5 px-4 whitespace-nowrap border-b border-slate-100">${fromToBadge(r.from, r.to)}</td>
        </tr>`
        )
        .join('');

      return `
      <div class="mb-6 bg-white rounded-2xl border-2 border-slate-300 shadow-sm overflow-hidden fade-in">
        <div class="flex items-center gap-2.5 px-5 py-3.5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200">
          <span class="inline-block w-2 h-2 rounded-full bg-orange-400"></span>
          <h4 class="text-sm font-bold text-slate-700">${formatDate(date)}</h4>
          <span class="text-[11px] font-semibold text-orange-600 bg-orange-50 ring-1 ring-orange-200 rounded-full px-2.5 py-0.5">${items.length} change${items.length === 1 ? '' : 's'}</span>
        </div>
        <div class="overflow-x-auto scrollbar-thin">
          <table class="w-full text-left border-collapse min-w-[700px] table-fixed">
            <colgroup>
              <col class="w-[80px]" />
              <col class="w-[110px]" />
              <col class="w-[140px]" />
              <col />
              <col class="w-[220px]" />
            </colgroup>
            <thead>
              <tr class="text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50">
                <th class="py-2.5 px-4 font-semibold border-b border-slate-200">Time</th>
                <th class="py-2.5 px-4 font-semibold border-b border-slate-200">Level</th>
                <th class="py-2.5 px-4 font-semibold border-b border-slate-200">Change Type</th>
                <th class="py-2.5 px-4 font-semibold border-b border-slate-200">Target</th>
                <th class="py-2.5 px-4 font-semibold border-b border-slate-200">From → To</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>`;
    })
    .join('');
}

// ---------------- SUMMARY TAB ----------------
let cachedSummaries = [];

async function loadSummaries() {
  const list = document.getElementById('summaryList');
  list.innerHTML = `<p class="text-slate-400 text-sm">Loading...</p>`;
  const summaries = await fetch(`/api/summaries?${cq()}`).then((r) => r.json());
  cachedSummaries = summaries;

  if (!summaries.length) {
    list.innerHTML = `<div class="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 text-sm">
      No AI summaries generated yet. Click <strong>Generate Now</strong> or wait for the automatic Friday run.
    </div>`;
    return;
  }

  list.innerHTML = summaries.map(renderSummaryCard).join('');
}

function renderSummaryCard(s) {
  return `
    <div class="bg-white rounded-xl border-2 border-slate-300 shadow-sm p-6 fade-in">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h4 class="font-bold text-slate-900">📊 Optimization Summary: ${formatDate(s.from)} – ${formatDate(s.to)}</h4>
        <span class="text-xs text-slate-400">Generated ${new Date(s.generatedAt).toLocaleString()}</span>
      </div>
      <div class="flex gap-3 mb-4 text-xs text-slate-500">
        <span class="bg-slate-100 rounded-full px-3 py-1">${s.totalChanges} changes analyzed</span>
        <span class="bg-slate-100 rounded-full px-3 py-1">${s.asinCount} ASINs</span>
      </div>
      <div class="prose prose-sm max-w-none prose-headings:font-bold prose-headings:text-slate-800 prose-h2:text-base prose-h3:text-sm prose-li:text-slate-600">
        ${marked.parse(s.summary)}
      </div>
    </div>`;
}

document.getElementById('filterSummaryBtn').addEventListener('click', () => {
  const from = document.getElementById('summaryFrom').value;
  const to = document.getElementById('summaryTo').value;
  const list = document.getElementById('summaryList');

  if (!from || !to) {
    list.innerHTML = cachedSummaries.map(renderSummaryCard).join('') || `<div class="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 text-sm">
      No AI summaries generated yet.
    </div>`;
    return;
  }

  const matches = cachedSummaries.filter((s) => s.from === from && s.to === to);
  if (matches.length) {
    list.innerHTML = matches.map(renderSummaryCard).join('');
  } else {
    list.innerHTML = `<div class="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400 text-sm">
      No summary found for this date range. Summaries are generated automatically every Friday.
    </div>`;
  }
});

// ---------------- AUTH ----------------
async function loadMe() {
  const data = await fetch('/api/me').then((r) => r.json());
  if (!data.user) {
    window.location.href = '/login.html';
    return;
  }
  document.getElementById('userBadge').textContent = `👤 ${data.user.username}`;
  if (data.user.role === 'admin') {
    document.getElementById('adminLink').classList.remove('hidden');
  }
  if (data.user.role === 'client') {
    const uploadLabel = document.getElementById('uploadLabel');
    const allClientsLink = document.getElementById('allClientsLink');
    const allClientsSep = document.getElementById('allClientsSep');
    if (uploadLabel) uploadLabel.classList.add('hidden');
    if (allClientsLink) allClientsLink.classList.add('hidden');
    if (allClientsSep) allClientsSep.classList.add('hidden');
  }
}

async function loadClientName() {
  try {
    const clients = await fetch('/api/clients').then((r) => r.json());
    const client = clients.find((c) => c.id === CLIENT_ID);
    const label = document.getElementById('clientNameLabel');
    if (label) label.textContent = client ? client.name : 'Unknown Client';
  } catch (e) {
    const label = document.getElementById('clientNameLabel');
    if (label) label.textContent = 'Unknown Client';
  }
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

// ---------------- INIT ----------------
async function refreshAll() {
  await Promise.all([loadStats(), loadDates(), loadGraphs()]);
}
loadMe();
loadClientName();
refreshAll();
