// Turns a typed request into an intent for the Ask Lumi assistant.
// Pure and rule-based (no AI model): every number in an answer comes from the
// planner's engine, never from this parser.

const ALIASES = {
  ridge: ['connecting ridge', 'shackleton ridge', 'shackleton rim', 'the ridge', 'ridge'],
  'peak-shackleton': ['ridge high point', 'high point', 'massif', 'peak near shackleton'],
  shackleton: ['shackleton crater', 'shackleton floor', 'crater floor', 'shackleton'],
  'best-1': ['best-lit cell #2', 'best lit cell 2', 'best-lit 2'],
  'best-2': ['best-lit cell #3', 'best lit cell 3', 'best-lit 3'],
  degerlache: ['de gerlache', 'gerlache'],
  shoemaker: ['shoemaker'],
  haworth: ['haworth'],
  faustini: ['faustini'],
  nobile: ['nobile'],
  lcross: ['lcross', 'cabeus'],
  im1: ['im-1', 'im1', 'odysseus', 'malapert'],
  im2: ['im-2', 'im2', 'athena', 'mons mouton'],
  bg1: ['blue ghost', 'mare crisium'],
  im3: ['im-3', 'im3', 'reiner gamma'],
  a11: ['apollo 11', 'apollo eleven', 'tranquility base', 'tranquility'],
  a12: ['apollo 12'],
  a14: ['apollo 14'],
  a15: ['apollo 15'],
  a16: ['apollo 16'],
  a17: ['apollo 17'],
  ch3: ['chandrayaan-3', 'chandrayaan 3', 'chandrayaan', 'vikram', 'shiv shakti'],
  slim: ['slim'],
  ce4: ["chang'e 4", 'change 4', 'chang e 4', 'change4'],
  ce6: ["chang'e 6", 'change 6', 'chang e 6'],
  ce5: ["chang'e 5", 'change 5', 'chang e 5'],
  ce3: ["chang'e 3", 'change 3', 'chang e 3'],
  luna25: ['luna 25', 'luna-25', 'boguslawsky'],
  luna9: ['luna 9', 'luna-9'],
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DIRS = { north: 'N', south: 'S', east: 'E', west: 'W', n: 'N', s: 'S', e: 'E', w: 'W' };

const norm = (t) => ` ${String(t).toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()} `;

/** Known sites mentioned in the text, in the order they appear. */
export function findSites(text, sites) {
  const t = norm(text);
  const hits = [];
  const taken = [];
  const entries = [];
  for (const s of sites) {
    const names = new Set([...(ALIASES[s.id] || []), s.name.toLowerCase(), (s.short || '').toLowerCase()].filter((n) => n.length >= 3));
    for (const n of names) entries.push({ n, s });
  }
  entries.sort((a, b) => b.n.length - a.n.length); // longest names first
  for (const { n, s } of entries) {
    const re = new RegExp(`(^|[^a-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);
    const m = re.exec(t);
    if (!m) continue;
    const start = m.index, end = m.index + m[0].length;
    if (taken.some(([a, b]) => start < b && end > a)) continue;
    if (hits.some((h) => h.site.id === s.id)) continue;
    taken.push([start, end]);
    hits.push({ site: s, at: start });
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.site);
}

/** Coordinates such as "-89.45, -137.3" or "89.45S 137.3W". */
export function findCoords(text) {
  const m = /(-?\d{1,2}(?:\.\d+)?)\s*°?\s*([ns])?\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([ew])?(?![\d.])/i.exec(text);
  if (!m) return null;
  let lat = Number(m[1]), lon = Number(m[3]);
  if (m[2] && m[2].toLowerCase() === 's') lat = -Math.abs(lat);
  if (m[4] && m[4].toLowerCase() === 'w') lon = -Math.abs(lon);
  if (!m[2] && !m[4] && !/[,;]/.test(m[0])) return null; // two bare numbers without a comma: probably not coordinates
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** A UTC date mentioned in the text: ISO, "3 March 2027", "March 2027", "tomorrow". */
export function findDate(text, nowMs) {
  const t = norm(text);
  let m = /(\d{4})-(\d{2})-(\d{2})(?:[t ](\d{2}):(\d{2}))?/.exec(t);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  m = new RegExp(`(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+)?(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{4})`).exec(t);
  if (m) return Date.UTC(+m[3], MONTHS.indexOf(m[2]), m[1] ? +m[1] : 1);
  m = new RegExp(`(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})`).exec(t);
  if (m) return Date.UTC(+m[3], MONTHS.indexOf(m[1]), +m[2]);
  m = /\b(?:in|during|for|from) (20\d{2}|19\d{2})\b/.exec(t);
  if (m) return Date.UTC(+m[1], 0, 1);
  if (/\btomorrow\b/.test(t)) return nowMs + 86400000;
  if (/\b(today|now)\b/.test(t)) return nowMs;
  m = /\bin (\d+) (day|week|month)s?\b/.exec(t);
  if (m) return nowMs + +m[1] * { day: 1, week: 7, month: 29.530588 }[m[2]] * 86400000;
  return null;
}

const TERMS = [
  ['libration', /librat|wobble/],
  ['elevation', /elevation|altitude|how high/],
  ['azimuth', /azimuth|compass/],
  ['horizon', /horizon|skyline/],
  ['disk', /disk|disc/],
  ['dte', /\bdte\b|direct.to.earth/],
  ['dsn', /\bdsn\b|deep space network/],
  ['lola', /\blola\b|terrain data|altimeter/],
  ['margin', /margin|link budget/],
  ['pole', /south pole|why the pole|why polar/],
  ['shadow', /shadow|cold trap|crater floor|ice/],
  ['battery', /battery|night/],
  ['earthhidden', /(earth|sun) (is )?(hidden|blocked|not visible|gone)|can'?t see (the )?(earth|sun)/],
  ['earthfixed', /earth (barely|hardly) move|why (does|is) earth|earth stay/],
  ['farside', /far side|farside|dark side/],
];

/** Parse a request into { type, ... }. */
export function parseRequest(text, sites, nowMs = Date.now()) {
  const t = norm(text);
  const found = findSites(text, sites);
  const minDays = (() => { const m = /(\d+)\s*\+?\s*(?:full\s+)?days?/.exec(t); return m ? Math.min(30, Math.max(1, +m[1])) : null; })();

  if (/^\s*(help|hi|hello|hey|what can you do|\?)\s*[!?.]*\s*$/.test(t)) return { type: 'help' };
  if (/\b(dark|light) (mode|theme)\b/.test(t)) return { type: 'theme', value: /\bdark\b/.test(t) ? 'dark' : 'light' };
  if (/\b(start|show|give me) (the |a )?(tour|walkthrough)\b|\bguide me\b|\bshow me around\b|\bhow (do|does) (i|this|it) work\b/.test(t)) return { type: 'tour' };
  if (/\bbeginner\b/.test(t)) return { type: 'beginner' };
  if (/\b(terrain 3d|3d terrain|cesium)\b/.test(t)) return { type: 'terrain' };
  if (/^\s*(play|start playing|animate)\b/.test(t)) return { type: 'play', on: true };
  if (/^\s*(pause|stop)\b/.test(t)) return { type: 'play', on: false };
  if (/\b(earthrise|look at (the )?earth|see (the )?earth|where is earth)\b/.test(t) && !/\bwhy\b/.test(t)) return { type: 'look', body: 'earth' };
  if (/\b(look at|see|where is) the sun\b/.test(t) && !/\bwhy\b/.test(t)) return { type: 'look', body: 'sun' };

  const nudge = /\b(move|shift|nudge|what if|go)\b[^0-9]*(\d+(?:\.\d+)?)\s*(?:km|kilomet(?:er|re)s?)\s*(?:to the\s+)?(north|south|east|west|n|s|e|w)\b/.exec(t);
  if (nudge) return { type: 'nudge', km: Math.min(50, +nudge[2]), dir: DIRS[nudge[3]] };
  const shiftDays = /\b(\d+)\s*days?\s*(later|earlier|after|before)\b/.exec(t);
  if (shiftDays && !/\b(best|next|find)\b/.test(t)) return { type: 'shiftDays', days: +shiftDays[1] * (/later|after/.test(shiftDays[2]) ? 1 : -1) };

  if (/\bcompare\b|\bvs\.?\b|\bversus\b/.test(t)) {
    const slip = /\b(\d+)\s*months?\s*(later|slip)?|\bslip/.test(t) && !found.length;
    return { type: 'compare', sites: found, slip };
  }

  if (/\b(best|next|good|earliest|first)\b[^.?!]*\b(date|time|window|day|moment|landing)s?\b|\bwhen (should|can|could|do) (i|we) land\b|\bfind (a|the next)? ?(good )?(date|window)\b/.test(t)) {
    return { type: 'bestDate', site: found[0] || null, from: findDate(text, nowMs), minDays: minDays || 3 };
  }
  if (/\bbest (\w+ )?(spot|site|place|location|landing site)s?\b|\bwhere (should|can|could) (i|we) land\b|\bsunniest\b/.test(t)) {
    return { type: 'bestSpot', flown: /\b(flown|landed|previous|already|past)\b/.test(t) };
  }

  if (/\b(why|what is|what's|whats|what are|explain|meaning|define|how come)\b/.test(t)) {
    const term = TERMS.find(([, re]) => re.test(t));
    if (term) return { type: 'explain', term: term[0] };
  }
  if (/\bsunset\b|\bsun (go )?down\b|\bwhen does the sun set\b/.test(t)) return { type: 'when', what: 'sunset' };
  if (/\bearthset\b|\bearth (go )?down\b|\blose (contact|earth|signal)\b/.test(t)) return { type: 'when', what: 'earthset' };
  if (/\b(power|solar|sunlight|sun up|energy|watts?)\b/.test(t) && !found.length) return { type: 'status', focus: 'power' };
  if (/\b(earth|radio|comms?|communicat\w*|talk|contact|signal|link)\b/.test(t) && !found.length) return { type: 'status', focus: 'earth' };
  if (/\b(go|no.?go|status|verdict|safe|ok|okay|good)\b\??/.test(t) && !found.length && !findCoords(text)) return { type: 'status', focus: 'all' };

  const coords = findCoords(text);
  if (coords) return { type: 'gotoCoords', ...coords };
  if (found.length) return { type: 'goto', site: found[0], date: findDate(text, nowMs) };
  const date = findDate(text, nowMs);
  if (date !== null) return { type: 'gotoDate', ms: date };
  return { type: 'unknown' };
}
