const CLIENT_ID = new URLSearchParams(window.location.search).get('clientId');
if (!CLIENT_ID) {
  window.location.href = '/clients.html';
  throw new Error('Redirecting to client selection — no clientId in URL.');
}
const cq = (extra = '') => `clientId=${encodeURIComponent(CLIENT_ID)}${extra}`;

document.getElementById('changeHistoryLink').href = `/dashboard.html?clientId=${encodeURIComponent(CLIENT_ID)}`;

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
    const allClientsLink = document.getElementById('allClientsLink');
    if (allClientsLink) allClientsLink.classList.add('hidden');
  }
}

async function loadClientName() {
  try {
    const clients = await fetch('/api/clients').then((r) => r.json());
    const client = clients.find((c) => c.id === CLIENT_ID);
    document.getElementById('clientNameLabel').textContent = client ? client.name : 'Unknown Client';
  } catch (e) {
    document.getElementById('clientNameLabel').textContent = 'Unknown Client';
  }
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
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

// ---------------- CHARTS ----------------
const palette = ['#f97316', '#0ea5e9', '#8b5cf6', '#10b981', '#ec4899', '#6366f1', '#f59e0b', '#14b8a6', '#ef4444', '#84cc16'];

let charts = {};

function destroyCharts() {
  Object.values(charts).forEach((c) => c && c.destroy());
  charts = {};
}

async function loadAnalytics() {
  const from = document.getElementById('fromDate').value;
  const to = document.getElementById('toDate').value;
  let url = `/api/analytics?${cq()}`;
  if (from) url += `&from=${from}`;
  if (to) url += `&to=${to}`;
  const data = await fetch(url).then((r) => r.json());

  destroyCharts();

  // Activity over time
  charts.activity = new Chart(document.getElementById('chartActivity'), {
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

  // Action breakdown
  charts.actionBreakdown = new Chart(document.getElementById('chartActionBreakdown'), {
    type: 'pie',
    data: {
      labels: data.actionBreakdown.map((d) => d.action),
      datasets: [{
        data: data.actionBreakdown.map((d) => d.count),
        backgroundColor: data.actionBreakdown.map((_, i) => palette[i % palette.length]),
      }],
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });

  // Bid increases vs decreases
  charts.bids = new Chart(document.getElementById('chartBids'), {
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

  // Top ASINs
  charts.topAsins = new Chart(document.getElementById('chartTopAsins'), {
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

  // Campaigns paused over time
  charts.campaignsPaused = new Chart(document.getElementById('chartCampaignsPaused'), {
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

document.getElementById('applyFilterBtn').addEventListener('click', loadAnalytics);
document.getElementById('clearFilterBtn').addEventListener('click', () => {
  document.getElementById('fromDate').value = '';
  document.getElementById('toDate').value = '';
  loadAnalytics();
});

// ---------------- INIT ----------------
loadMe();
loadClientName();
loadStats();
loadAnalytics();
