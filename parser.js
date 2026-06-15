const { parse } = require('csv-parse/sync');

const ASIN_REGEX = /\bB0[A-Z0-9]{8}\b/;

function detectLevel(changeLevel) {
  if (changeLevel.startsWith('Campaign:')) return 'Campaign';
  if (changeLevel.startsWith('Ad group:')) return 'Ad Group';
  if (changeLevel.toLowerCase().startsWith('keyword')) return 'Keyword';
  return 'Other';
}

function detectAction(changeType) {
  const t = changeType.toLowerCase();
  if (t.includes('negative keyword')) return 'Negative Keyword';
  if (t.startsWith('keyword bid')) return 'Keyword Bid';
  if (t.startsWith('keyword status')) return 'Keyword Status';
  if (t.startsWith('keyword(') && t.includes('added')) return 'Keyword Added';
  if (t === 'campaign status') return 'Campaign Status';
  if (t.startsWith('campaign daily budget')) return 'Budget';
  if (t.startsWith('bid adjustment')) {
    if (t.includes('top of search')) return 'Bid Adjustment (Top of Search)';
    if (t.includes('rest of search')) return 'Bid Adjustment (Rest of Search)';
    if (t.includes('product page')) return 'Bid Adjustment (Product Pages)';
    return 'Bid Adjustment';
  }
  if (t.startsWith('targeting group bid')) return 'Targeting Bid';
  if (t.startsWith('targeting group status')) return 'Targeting Status';
  if (t.startsWith('category target bid')) return 'Category Target Bid';
  if (t.startsWith('ad product status')) return 'Product Status';
  if (t.startsWith('ad product') && t.includes('added to ad group')) return 'Product Added';
  if (t.startsWith('ad group name')) return 'Ad Group Name';
  if (t.startsWith('ad group status')) return 'Ad Group Status';
  if (t.startsWith('campaign name')) return 'Campaign Name';
  if (t.startsWith('portfolio')) return 'Portfolio';
  return changeType;
}

// Convert "5/20/2026 17:36" (M/D/YYYY H:mm) to ISO-ish parts
// Amazon's export concatenates UI link text (e.g. "Edit targeting", "Edit ads")
// onto the end of the To/From value with no separator. Strip it off.
const TRAILING_LINK_TEXT = /(Edit (targeting|ads|bid|negative targeting))$/i;

function cleanValue(val) {
  return (val || '').trim().replace(TRAILING_LINK_TEXT, '').trim();
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function parseDateTime(str) {
  const s = str.trim();

  // Format: "Jun 15, 2026 11:21 AM"
  const longMatch = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (longMatch) {
    const [, monStr, dStr, yStr, hStr, minStr, ampm] = longMatch;
    const m = MONTHS[monStr.toLowerCase().slice(0, 3)];
    let h = Number(hStr) % 12;
    if (ampm.toUpperCase() === 'PM') h += 12;
    const dateISO = `${yStr}-${String(m).padStart(2, '0')}-${String(dStr).padStart(2, '0')}`;
    const time24 = `${String(h).padStart(2, '0')}:${minStr}`;
    return { dateISO, datetime: `${dateISO} ${time24}` };
  }

  // Format: "5/20/2026 17:36" (M/D/YYYY H:mm)
  const [datePart, timePart] = s.split(' ');
  const [m, d, y] = datePart.split('/').map(Number);
  const dateISO = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { dateISO, datetime: `${dateISO} ${timePart || ''}`.trim() };
}

function parseCsv(csvText, sourceFileName) {
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  const rows = [];
  for (const r of records) {
    const changeLevel = (r['Change Level'] ?? r['changeLevel'] ?? '').trim();
    const changeType = (r['Change Type'] ?? r['changeType'] ?? '').trim();
    const from = cleanValue(r['From'] ?? r['from']);
    const to = cleanValue(r['To'] ?? r['to']);
    const dt = (r['Date and Time'] ?? r['dateAndTime'] ?? '').trim();
    if (!changeLevel || !dt) continue;

    // Skip noisy auto in-budget/out-of-budget campaign status flips
    const fromTo = `${from}|${to}`.toLowerCase();
    if (changeType.toLowerCase() === 'campaign status' && /in budget|out of budget/.test(fromTo)) continue;

    const asinMatch = changeLevel.match(ASIN_REGEX);
    const asin = asinMatch ? asinMatch[0] : 'UNASSIGNED';
    const { dateISO, datetime } = parseDateTime(dt);

    rows.push({
      asin,
      level: detectLevel(changeLevel),
      changeLevel,
      action: detectAction(changeType),
      rawChangeType: changeType,
      from,
      to,
      date: dateISO,
      datetime,
      sourceFile: sourceFileName || null,
    });
  }
  return rows;
}

module.exports = { parseCsv, ASIN_REGEX };
