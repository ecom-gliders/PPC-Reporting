const crypto = require('crypto');
const OpenAI = require('openai');
const db = require('./db');

function getDefaultWeekRange() {
  // most recently completed Monday-Friday work week
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  // days since the most recent Friday (if today is Friday or earlier in the week, go back to last week's Friday)
  const daysSinceFriday = (day + 2) % 7; // Fri->0, Sat->1, Sun->2, Mon->3, Tue->4, Wed->5, Thu->6
  const to = new Date(now);
  to.setDate(to.getDate() - daysSinceFriday);
  const from = new Date(to);
  from.setDate(from.getDate() - 4);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

// Pulls the match type (Exact/Phrase/Broad) out of a "Raw Change Type" string like
// `Keyword bid(exact) - xl mens face mask` or `Keyword status (phrase) - ...`
function extractMatchType(rawChangeType) {
  const m = (rawChangeType || '').match(/\((exact|phrase|broad)\)/i);
  return m ? m[1].toLowerCase() : null;
}

// Pulls the campaign name out of a "Change Level" string, e.g.
// `Ad group: Top Kws - PhraseCampaign: SP - Arm Sleeves - B07XYLSXYB - Top Kws - Phrase`
// -> "SP - Arm Sleeves - B07XYLSXYB - Top Kws - Phrase"
function extractCampaignName(changeLevel) {
  const m = (changeLevel || '').match(/Campaign:\s*(.+)$/);
  return m ? m[1].trim() : null;
}

const BID_ACTIONS = new Set(['Keyword Bid', 'Targeting Bid', 'Category Target Bid', 'Bid Adjustment']);

// Parses values like "$1.60", "20%", "1.6" into a plain number, or null if not numeric
function parseNumeric(val) {
  if (!val) return null;
  const cleaned = val.replace(/[$%,]/g, '').trim();
  const num = parseFloat(cleaned);
  return Number.isNaN(num) ? null : num;
}

function emptyStats() {
  return {
    exactBidChanges: 0,
    phraseBidChanges: 0,
    broadBidChanges: 0,
    campaignsTouched: new Set(),
    negativeKeywordsAdded: 0,
    productTargetingBidUpdates: 0,
    campaignsPaused: new Set(),
    pausedKeywords: 0,
    budgetUpdates: 0,
    bidsIncreased: 0,
    bidsDecreased: 0,
    placementAdjustmentsIncreased: 0,
    placementAdjustmentsDecreased: 0,
  };
}

function buildAsinStats(changes) {
  const byAsin = {};
  for (const c of changes) {
    if (!byAsin[c.asin]) byAsin[c.asin] = emptyStats();
    const s = byAsin[c.asin];
    const matchType = extractMatchType(c.rawChangeType);
    const campaign = extractCampaignName(c.changeLevel);

    if (campaign) s.campaignsTouched.add(campaign);

    switch (c.action) {
      case 'Keyword Bid':
        if (matchType === 'exact') s.exactBidChanges++;
        else if (matchType === 'phrase') s.phraseBidChanges++;
        else if (matchType === 'broad') s.broadBidChanges++;
        break;
      case 'Negative Keyword':
        s.negativeKeywordsAdded++;
        break;
      case 'Targeting Bid':
        s.productTargetingBidUpdates++;
        break;
      case 'Campaign Status':
        if (c.to && c.to.toLowerCase() === 'paused' && campaign) s.campaignsPaused.add(campaign);
        break;
      case 'Keyword Status':
        if (c.to && c.to.toLowerCase() === 'paused') s.pausedKeywords++;
        break;
      case 'Budget':
        s.budgetUpdates++;
        break;
      default:
        break;
    }

    if (BID_ACTIONS.has(c.action)) {
      const fromNum = parseNumeric(c.from);
      const toNum = parseNumeric(c.to);
      if (fromNum !== null && toNum !== null) {
        if (c.action === 'Bid Adjustment') {
          if (toNum > fromNum) s.placementAdjustmentsIncreased++;
          else if (toNum < fromNum) s.placementAdjustmentsDecreased++;
        } else {
          if (toNum > fromNum) s.bidsIncreased++;
          else if (toNum < fromNum) s.bidsDecreased++;
        }
      }
    }
  }
  return byAsin;
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const METRICS = [
  ['exactBidChanges', 'Exact Match Bid Changes'],
  ['phraseBidChanges', 'Phrase Match Bid Changes'],
  ['broadBidChanges', 'Broad Match Bid Changes'],
  ['campaignsTouched', 'Campaigns Touched'],
  ['negativeKeywordsAdded', 'Negative Keywords Added'],
  ['productTargetingBidUpdates', 'Product Targeting Bid Updates'],
  ['campaignsPaused', 'Campaigns: Delivering → Paused'],
  ['pausedKeywords', 'Total Keywords Paused'],
  ['budgetUpdates', 'Campaign Budget Updates'],
  ['bidsIncreased', 'Total Bids Increased'],
  ['bidsDecreased', 'Total Bids Decreased'],
  ['placementAdjustmentsIncreased', 'Placement Bid Adjustments ↑'],
  ['placementAdjustmentsDecreased', 'Placement Bid Adjustments ↓'],
];

function buildReport(changes, from, to) {
  const byAsin = buildAsinStats(changes);

  // sort ASINs by total activity (most active first), UNASSIGNED last
  const asins = Object.keys(byAsin).sort((a, b) => {
    if (a === 'UNASSIGNED') return 1;
    if (b === 'UNASSIGNED') return -1;
    const totalA = Object.values(byAsin[a]).reduce((acc, v) => acc + (v instanceof Set ? v.size : v), 0);
    const totalB = Object.values(byAsin[b]).reduce((acc, v) => acc + (v instanceof Set ? v.size : v), 0);
    return totalB - totalA;
  });

  let html = `<div class="space-y-4">`;

  for (const asin of asins) {
    const s = byAsin[asin];
    html += `<div class="border border-slate-200 rounded-md overflow-hidden">`;
    html += `<div class="bg-slate-50 border-b border-slate-200 px-3 py-1.5 font-semibold text-xs text-slate-700 tracking-wide">${asin}</div>`;
    html += `<table class="w-full text-xs">`;
    for (let i = 0; i < METRICS.length; i += 2) {
      html += `<tr class="${i % 4 === 0 ? '' : 'bg-slate-50/50'} border-t border-slate-100 first:border-t-0">`;
      for (let j = i; j < Math.min(i + 2, METRICS.length); j++) {
        const [key, label] = METRICS[j];
        const value = s[key] instanceof Set ? s[key].size : s[key];
        const valueClass = value > 0 ? 'text-slate-900' : 'text-slate-300';
        html += `<td class="px-3 py-1.5 text-slate-500">${label}</td>`;
        html += `<td class="px-3 py-1.5 text-right font-semibold ${valueClass}" style="width:1%">${value}</td>`;
      }
      if ((METRICS.length - i) < 2) {
        html += `<td class="px-3 py-1.5" colspan="2"></td>`;
      }
      html += `</tr>`;
    }
    html += `</table></div>`;
  }

  html += `</div>`;
  return html;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function simpleMarkdownToHtml(text) {
  const lines = text.split('\n');
  let html = '';
  for (let line of lines) {
    line = line.trim();
    if (!line) continue;
    if (/^#+\s*/.test(line)) continue; // skip markdown headings, we render our own
    line = line.replace(/^[-*]\s+/, ''); // turn bullets into plain paragraphs
    line = escapeHtml(line);
    line = line.replace(/\*\*(.+?)\*\*/g, '<strong class="text-slate-800">$1</strong>');
    html += `<p class="text-sm text-slate-600 leading-relaxed">${line}</p>`;
  }
  return html;
}

async function buildWhySection(byAsinStatsText, context) {
  const apiKey = (db.getSettings().openaiApiKey || process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey || !context || !context.trim()) return '';

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          `You are an Amazon PPC analyst writing a short closing note for a client report. ` +
          `You will be given a per-ASIN table of optimization counts for the period, and the analyst's own date-wise notes ` +
          `explaining why changes were made on each day. Write a brief explanation (2-5 short sentences, as plain paragraphs - ` +
          `no headings, no bullet points, no markdown formatting) in plain language for the client, summarizing and grounded in the analyst's notes. ` +
          `Do not invent reasons not supported by the notes. Keep it concise and client-friendly.`,
      },
      {
        role: 'user',
        content: `Per-ASIN change counts for this period:\n${byAsinStatsText}\n\nAnalyst's date-wise notes on why these changes were made:\n${context.trim()}`,
      },
    ],
    temperature: 0.4,
  });

  const text = completion.choices[0].message.content.trim();
  return `<div class="mt-5 border border-amber-200 bg-amber-50 rounded-md p-4">
    <div class="flex items-center gap-2 mb-2">
      <span class="text-amber-500">●</span>
      <h3 class="text-sm font-bold text-slate-800 m-0">Why These Changes Were Made</h3>
    </div>
    <div class="space-y-1.5">${simpleMarkdownToHtml(text)}</div>
  </div>`;
}

function buildDailyContextText(clientId, from, to) {
  const dailyContexts = db.getDailyContexts().filter((d) => d.clientId === clientId && d.date >= from && d.date <= to);
  if (!dailyContexts.length) return '';
  return dailyContexts
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => `${d.date}: ${d.context}`)
    .join('\n');
}

function buildStatsText(byAsin) {
  let text = '';
  for (const [asin, s] of Object.entries(byAsin)) {
    text += `ASIN ${asin}: `;
    text += METRICS.map(([key, label]) => `${label} = ${s[key] instanceof Set ? s[key].size : s[key]}`).join(', ');
    text += '\n';
  }
  return text;
}

async function generateWeeklySummary({ clientId, from, to, context }) {
  if (!clientId) {
    throw new Error('clientId is required to generate a summary.');
  }

  const range = from && to ? { from, to } : getDefaultWeekRange();
  const allChanges = db.getChanges();
  const changes = allChanges.filter((c) => c.clientId === clientId && c.date >= range.from && c.date <= range.to);

  if (changes.length === 0) {
    throw new Error(`No change history found between ${range.from} and ${range.to} for this client.`);
  }

  const byAsin = buildAsinStats(changes);
  let summaryText = buildReport(changes, range.from, range.to);

  const dailyContextText = buildDailyContextText(clientId, range.from, range.to);
  const combinedContext = [dailyContextText, context && context.trim()].filter(Boolean).join('\n\n');

  try {
    const whySection = await buildWhySection(buildStatsText(byAsin), combinedContext);
    summaryText += whySection;
  } catch (err) {
    summaryText += `<div class="mt-4 pt-3 border-t border-slate-200 text-xs text-red-500">Could not generate "Why These Changes Were Made" section: ${err.message}</div>`;
  }

  const summaries = db.getSummaries();
  const record = {
    id: crypto.randomUUID(),
    clientId,
    from: range.from,
    to: range.to,
    generatedAt: new Date().toISOString(),
    totalChanges: changes.length,
    asinCount: new Set(changes.map((c) => c.asin)).size,
    summary: summaryText,
  };
  summaries.push(record);
  db.saveSummaries(summaries);

  return record;
}

module.exports = { generateWeeklySummary, getDefaultWeekRange };
