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
  if (t.startsWith('bid adjustment')) return 'Bid Adjustment';
  if (t.startsWith('targeting group bid')) return 'Targeting Bid';
  if (t.startsWith('targeting group status')) return 'Targeting Status';
  if (t.startsWith('category target bid')) return 'Category Target Bid';
  if (t.startsWith('ad product status')) return 'Product Status';
  return changeType;
}

// Convert "5/20/2026 17:36" (M/D/YYYY H:mm) to ISO-ish parts
// Amazon's export concatenates UI link text (e.g. "Edit targeting", "Edit ads")
// onto the end of the To/From value with no separator. Strip it off.
const TRAILING_LINK_TEXT = /(Edit (targeting|ads|bid|negative targeting))$/i;

function cleanValue(val) {
  return (val || '').trim().replace(TRAILING_LINK_TEXT, '').trim();
}

function parseDateTime(str) {
  const [datePart, timePart] = str.trim().split(' ');
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
    const changeLevel = (r['Change Level'] || '').trim();
    const changeType = (r['Change Type'] || '').trim();
    const from = cleanValue(r['From']);
    const to = cleanValue(r['To']);
    const dt = (r['Date and Time'] || '').trim();
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
