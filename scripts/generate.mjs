// Emerald profile cards: productive-time + profile-details.
// Usage: GH_TOKEN=... USERNAME=emirdevs UTC_OFFSET=0 node scripts/generate.mjs   (MOCK=1 for fake data)
import { writeFileSync, mkdirSync } from 'node:fs';

const USER = process.env.USERNAME || 'emirdevs';
const OFFSET = Number(process.env.UTC_OFFSET || 0);
const OUT = process.env.OUT_DIR || 'cards';
const TOKEN = process.env.GH_TOKEN;

const C = { accent: '#34C997', deep: '#0B8A5F', text: '#8B8B92', grid: '#8B8B92' };
const FONT = `font-family="'Segoe UI', Ubuntu, 'Helvetica Neue', sans-serif"`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function gql(query, variables) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

async function load() {
  if (process.env.MOCK) {
    const hours = Array.from({ length: 24 }, (_, h) => [0, 0, 0, 0, 0, 0, 0, 3, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 4, 0, 0, 1, 0, 3][h]);
    const weeks = Array.from({ length: 53 }, (_, i) => Math.max(0, Math.round(6 + 5 * Math.sin(i / 5) + (i > 40 ? 8 : 0))));
    return { name: 'Emir Miraç Gezer', login: USER, joined: 2025, followers: 3, repos: 6, total: weeks.reduce((a, b) => a + b, 0), hours, weeks };
  }
  const to = new Date(), from = new Date(to); from.setFullYear(to.getFullYear() - 1);
  const base = await gql(`query($l:String!,$f:DateTime!,$t:DateTime!){ user(login:$l){ id name login createdAt
    followers{totalCount} repositories(ownerAffiliations:OWNER,isFork:false){totalCount}
    contributionsCollection(from:$f,to:$t){ contributionCalendar{ totalContributions weeks{ contributionDays{ contributionCount } } } } } }`,
    { l: USER, f: from.toISOString(), t: to.toISOString() });
  const u = base.user;
  const repos = await gql(`query($l:String!,$id:ID!,$s:GitTimestamp!){ user(login:$l){ repositories(first:100,ownerAffiliations:OWNER,isFork:false){ nodes{ defaultBranchRef{ target{ ... on Commit{ history(first:100,since:$s,author:{id:$id}){ nodes{ committedDate } } } } } } } } }`,
    { l: USER, id: u.id, s: from.toISOString() });
  const hours = new Array(24).fill(0);
  for (const r of repos.user.repositories.nodes)
    for (const c of r.defaultBranchRef?.target?.history?.nodes ?? []) {
      const h = (new Date(c.committedDate).getUTCHours() + OFFSET + 24) % 24; hours[h]++;
    }
  const weeks = u.contributionsCollection.contributionCalendar.weeks.map(w => w.contributionDays.reduce((a, d) => a + d.contributionCount, 0));
  return { name: u.name || u.login, login: u.login, joined: new Date(u.createdAt).getUTCFullYear(), followers: u.followers.totalCount,
    repos: u.repositories.totalCount, total: u.contributionsCollection.contributionCalendar.totalContributions, hours, weeks };
}

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ${FONT}>${body}</svg>\n`;
const label = (x, y, t, o = '') => `<text x="${x}" y="${y}" fill="${C.text}" ${o.includes('font-size') ? '' : 'font-size="12"'} ${o}>${esc(t)}</text>`;

function productiveTime(d) {
  const W = 470, H = 200, L = 38, R = 14, T = 52, B = 36;
  const pw = W - L - R, ph = H - T - B;
  const max = Math.max(4, ...d.hours);
  const step = Math.ceil(max / 4), top = step * 4;
  const bw = pw / 24;
  let s = `<text x="${L}" y="30" fill="${C.accent}" font-size="20" font-weight="600">Commits (UTC ${OFFSET >= 0 ? '+' : ''}${OFFSET.toFixed(2)})</text>`;
  for (let i = 0; i <= 4; i++) {
    const y = T + ph - (ph * i * step) / top;
    s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${C.grid}" stroke-opacity=".18"/>` + label(L - 8, y + 4, i * step, 'text-anchor="end" font-size="11"');
  }
  d.hours.forEach((v, h) => {
    const bh = (ph * v) / top;
    if (v) s += `<rect x="${L + h * bw + 2}" y="${T + ph - bh}" width="${bw - 4}" height="${bh}" rx="2" fill="${C.accent}"/>`;
  });
  for (const h of [0, 6, 12, 18, 23]) s += label(L + h * bw + bw / 2, H - 16, h, 'text-anchor="middle" font-size="11"');
  s += label(W - R, H - 2, 'per day hour', 'text-anchor="end" font-size="11"');
  return svg(W, H, s);
}

function profileDetails(d) {
  const W = 470, H = 200;
  const rows = [['Contributions (last year)', d.total], ['Public repos', d.repos], ['Followers', d.followers], ['Joined GitHub', d.joined]];
  let s = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.accent}" stop-opacity=".45"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/></linearGradient></defs>`;
  s += `<text x="16" y="30" fill="${C.accent}" font-size="20" font-weight="600">${esc(d.name)} (${esc(d.login)})</text>`;
  rows.forEach(([k, v], i) => { s += label(16, 58 + i * 20, k) + `<text x="${16 + 170}" y="${58 + i * 20}" fill="${C.accent}" font-size="12" font-weight="600">${esc(v)}</text>`; });
  // contribution area chart
  const X0 = 16, X1 = W - 16, Y0 = 108, Y1 = H - 16, max = Math.max(1, ...d.weeks);
  const pts = d.weeks.map((v, i) => [X0 + ((X1 - X0) * i) / (d.weeks.length - 1), Y1 - ((Y1 - Y0) * v) / max]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  s += `<path d="${line} L${X1} ${Y1} L${X0} ${Y1} Z" fill="url(#g)"/><path d="${line}" fill="none" stroke="${C.accent}" stroke-width="2" stroke-linejoin="round"/>`;
  s += `<line x1="${X0}" x2="${X1}" y1="${Y1}" y2="${Y1}" stroke="${C.grid}" stroke-opacity=".3"/>`;
  s += label(X1, 100, 'weekly contributions', 'text-anchor="end" font-size="11"');
  return svg(W, H, s);
}

const data = await load();
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/productive-time.svg`, productiveTime(data));
writeFileSync(`${OUT}/profile-details.svg`, profileDetails(data));
console.log('cards written to', OUT);
