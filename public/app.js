const CLIENT_ID = new URLSearchParams(window.location.search).get('clientId');
if (!CLIENT_ID) {
  window.location.href = '/clients.html';
  throw new Error('Redirecting to client selection — no clientId in URL.');
}
const cq = (extra = '') => `clientId=${encodeURIComponent(CLIENT_ID)}${extra}`;

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

// ---------------- DETAIL MODAL ----------------
let detailStore = [];

function eyeBtn(idx) {
  return `<button type="button" class="detail-eye-btn inline-flex items-center justify-center text-slate-400 hover:text-orange-600 transition shrink-0" data-idx="${idx}" title="View full text">
    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
  </button>`;
}

function targetCell(text) {
  const idx = detailStore.push({ title: 'Target', html: `<div class="font-mono text-sm">${escapeHtml(text)}</div>` }) - 1;
  return `<div class="flex items-center gap-1.5 min-w-0">
    <span class="truncate" title="${escapeHtml(text)}">${escapeHtml(text)}</span>
    ${text.length > 40 ? eyeBtn(idx) : ''}
  </div>`;
}

function fromToCell(from, to) {
  const badge = fromToBadge(from, to);
  if (!badge) return '';
  const isLong = (from || '').length > 30 || (to || '').length > 30;
  if (!isLong) return badge;
  const idx = detailStore.push({
    title: 'From → To',
    html: `<div class="space-y-2 font-mono text-sm">
      <div><span class="text-xs font-semibold text-slate-400 uppercase">From</span><div class="text-rose-600 break-all">${escapeHtml(from)}</div></div>
      <div><span class="text-xs font-semibold text-slate-400 uppercase">To</span><div class="text-emerald-600 break-all">${escapeHtml(to)}</div></div>
    </div>`,
  }) - 1;
  return `<div class="flex items-center gap-1.5 min-w-0"><div class="truncate">${badge}</div>${eyeBtn(idx)}</div>`;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.detail-eye-btn');
  if (!btn) return;
  const detail = detailStore[Number(btn.dataset.idx)];
  if (!detail) return;
  document.getElementById('detailModalTitle').textContent = detail.title;
  document.getElementById('detailModalBody').innerHTML = detail.html;
  document.getElementById('detailModal').classList.remove('hidden');
});
document.getElementById('detailModalClose').addEventListener('click', () => {
  document.getElementById('detailModal').classList.add('hidden');
});
document.getElementById('detailModal').addEventListener('click', (e) => {
  if (e.target.id === 'detailModal') document.getElementById('detailModal').classList.add('hidden');
});

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
const darkToggleBtn = document.getElementById('darkModeToggle');
if (darkToggleBtn) {
  darkToggleBtn.textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
  darkToggleBtn.addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('darkMode', isDark ? '1' : '0');
    darkToggleBtn.textContent = isDark ? '☀️' : '🌙';
  });
}

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

  const compareEnabled = document.getElementById('compareToggle').checked;
  const compareFrom = document.getElementById('compareFromDate').value;
  const compareTo = document.getElementById('compareToDate').value;
  if (compareEnabled && compareFrom && compareTo) {
    url += `&compareFrom=${compareFrom}&compareTo=${compareTo}`;
  }

  const data = await fetch(url).then((r) => r.json());

  destroyDashboardCharts();

  const activityDatasets = [{
    label: 'Changes',
    data: data.activityOverTime.map((d) => d.count),
    borderColor: '#f97316',
    backgroundColor: 'rgba(249,115,22,0.1)',
    fill: true,
    tension: 0.3,
  }];

  if (data.compare) {
    activityDatasets.push({
      label: 'Compare Period',
      data: data.compare.activityOverTime.map((d) => d.count),
      borderColor: '#94a3b8',
      backgroundColor: 'rgba(148,163,184,0.1)',
      borderDash: [6, 4],
      fill: true,
      tension: 0.3,
    });
  }

  const labels = data.activityOverTime.map((d) => d.date);
  const compareLabels = data.compare ? data.compare.activityOverTime.map((d) => d.date) : [];

  dashboardCharts.activity = new Chart(document.getElementById('chartActivity'), {
    type: 'line',
    data: {
      labels: labels.length >= compareLabels.length ? labels : compareLabels,
      datasets: activityDatasets,
    },
    options: { responsive: true, plugins: { legend: { display: !!data.compare } } },
  });

  renderCompareSummary(data);

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

function renderCompareSummary(data) {
  const box = document.getElementById('compareSummary');
  if (!data.compare) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }

  const pct = (cur, prev) => {
    if (!prev) return cur ? '+100%' : '0%';
    const diff = ((cur - prev) / prev) * 100;
    return `${diff >= 0 ? '+' : ''}${diff.toFixed(0)}%`;
  };

  const cards = [
    { label: 'Total Changes', cur: data.totalChanges, prev: data.compare.totalChanges },
    { label: 'Bid Increases', cur: data.bidIncreases, prev: data.compare.bidIncreases },
    { label: 'Bid Decreases', cur: data.bidDecreases, prev: data.compare.bidDecreases },
    { label: 'Campaigns Paused', cur: data.campaignsPaused.reduce((s, d) => s + d.count, 0), prev: data.compare.campaignsPaused.reduce((s, d) => s + d.count, 0) },
  ];

  box.innerHTML = cards.map((c) => {
    const diff = pct(c.cur, c.prev);
    const up = c.cur >= c.prev;
    const color = up ? 'text-emerald-600' : 'text-rose-600';
    return `
      <div class="bg-white rounded-2xl border-2 border-slate-300 p-4 shadow-sm">
        <div class="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">${c.label}</div>
        <div class="text-2xl font-bold text-slate-900">${c.cur}</div>
        <div class="text-xs mt-1"><span class="${color} font-semibold">${diff}</span> <span class="text-slate-400">vs ${c.prev} prev</span></div>
      </div>`;
  }).join('');
  box.classList.remove('hidden');
}

document.getElementById('compareToggle').addEventListener('change', (e) => {
  const row = document.getElementById('compareDateRow');
  if (e.target.checked) {
    row.classList.remove('hidden');
  } else {
    row.classList.add('hidden');
    document.getElementById('compareSummary').classList.add('hidden');
  }
  loadGraphs();
});
document.getElementById('compareFromDate').addEventListener('change', loadGraphs);
document.getElementById('compareToDate').addEventListener('change', loadGraphs);

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

let lastDailyData = null;
document.getElementById('dailySearch').addEventListener('input', () => renderDailyChanges());

async function loadDailyChanges(date) {
  const container = document.getElementById('dailyContainer');
  container.innerHTML = `<p class="text-slate-400 text-sm">Loading...</p>`;
  const data = await fetch(`/api/changes?date=${date}&${cq()}`).then((r) => r.json());
  lastDailyData = data;
  renderDailyChanges();
}

function renderDailyChanges() {
  detailStore = [];
  const data = lastDailyData;
  const container = document.getElementById('dailyContainer');
  if (!data) return;

  const search = document.getElementById('dailySearch').value.trim().toLowerCase();

  document.getElementById('dailyMeta').textContent = `${data.total} changes across ${data.asins} ASIN${data.asins === 1 ? '' : 's'}`;

  if (data.total === 0) {
    container.innerHTML = `<p class="text-slate-400 text-sm">No changes recorded on this date.</p>`;
    return;
  }

  let entries = Object.entries(data.grouped).sort((a, b) => {
    if (a[0] === 'UNASSIGNED') return 1;
    if (b[0] === 'UNASSIGNED') return -1;
    return b[1].length - a[1].length;
  });

  if (search) {
    entries = entries
      .map(([asin, rows]) => {
        if (asin.toLowerCase().includes(search)) return [asin, rows];
        const filteredRows = rows.filter((r) => shortName(r.changeLevel, r.asin).toLowerCase().includes(search) || r.action.toLowerCase().includes(search));
        return [asin, filteredRows];
      })
      .filter(([, rows]) => rows.length > 0);

    if (!entries.length) {
      container.innerHTML = `<p class="text-slate-400 text-sm">No changes match "${escapeHtml(search)}".</p>`;
      return;
    }
  }

  container.innerHTML = entries
    .map(([asin, rows]) => {
      const rowsHtml = rows
        .map(
          (r, i) => `
        <tr class="${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'} hover:bg-orange-50/70 transition-colors">
          <td class="py-2.5 px-4 text-xs text-slate-500 whitespace-nowrap font-mono border-b border-slate-100">${r.datetime.split(' ')[1] || ''}</td>
          <td class="py-2.5 px-4 whitespace-nowrap border-b border-slate-100">${levelBadge(r.level)}</td>
          <td class="py-2.5 px-4 whitespace-nowrap border-b border-slate-100">${actionBadge(r.action)}</td>
          <td class="py-2.5 px-4 text-sm text-slate-700 border-b border-slate-100 max-w-sm">${targetCell(shortName(r.changeLevel, r.asin))}</td>
          <td class="py-2.5 px-4 max-w-xs border-b border-slate-100">${fromToCell(r.from, r.to)}</td>
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
let lastAsinList = [];
let selectedAsin = null;
document.getElementById('asinSearch').addEventListener('input', () => renderAsinList());

function asinDateQuery() {
  const from = document.getElementById('asinFromDate').value;
  const to = document.getElementById('asinToDate').value;
  let q = '';
  if (from) q += `&from=${from}`;
  if (to) q += `&to=${to}`;
  return q;
}

document.getElementById('asinApplyFilterBtn').addEventListener('click', () => {
  loadAsinList();
  if (selectedAsin) loadAsinTimeline(selectedAsin);
});
document.getElementById('asinClearFilterBtn').addEventListener('click', () => {
  document.getElementById('asinFromDate').value = '';
  document.getElementById('asinToDate').value = '';
  loadAsinList();
  if (selectedAsin) loadAsinTimeline(selectedAsin);
});

async function loadAsinList() {
  let asins = await fetch(`/api/asins?${cq()}${asinDateQuery()}`).then((r) => r.json());
  asins = asins.sort((a, b) => {
    if (a.asin === 'UNASSIGNED') return 1;
    if (b.asin === 'UNASSIGNED') return -1;
    return b.count - a.count;
  });
  lastAsinList = asins;
  renderAsinList();
}

function renderAsinList() {
  let asins = lastAsinList;
  const search = document.getElementById('asinSearch').value.trim().toLowerCase();
  if (search) asins = asins.filter((a) => a.asin.toLowerCase().includes(search));

  const list = document.getElementById('asinList');
  if (!asins.length) {
    list.innerHTML = `<p class="text-slate-400 text-sm p-4">No ASINs match your search.</p>`;
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
      selectedAsin = btn.dataset.asin;
      loadAsinTimeline(selectedAsin);
    })
  );
}

async function loadAsinTimeline(asin) {
  detailStore = [];
  const container = document.getElementById('asinTimeline');
  container.innerHTML = `<p class="text-slate-400 text-sm">Loading...</p>`;
  const data = await fetch(`/api/changes?asin=${encodeURIComponent(asin)}&${cq()}${asinDateQuery()}`).then((r) => r.json());
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
          <td class="py-2.5 px-4 text-sm text-slate-700 border-b border-slate-100 max-w-sm">${targetCell(shortName(r.changeLevel, r.asin))}</td>
          <td class="py-2.5 px-4 max-w-xs border-b border-slate-100">${fromToCell(r.from, r.to)}</td>
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
    document.getElementById('logsLink').classList.remove('hidden');
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
