/* ================================================================
   MOKA HOUSE — Production-ready API
   Deploy: Render / Fly.io / Railway (free tiers)
================================================================ */
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const FLOW = ['queued', 'brewing', 'ready', 'picked-up'];

/* ---------- Environment ---------- */
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleEnabled = /\.apps\.googleusercontent\.com$/.test(GOOGLE_CLIENT_ID);

/* ---------- auth helpers ---------- */
const SESSION_TTL = 12 * 60 * 60 * 1000;
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
const validUserName = u => /^[a-zA-Z0-9_.-]{3,20}$/.test(u);

/* ---------- rate limiter ---------- */
function makeLimiter({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const key = req.ip || req.headers['x-forwarded-for'] || 'anon';
    const now = Date.now();
    let rec = hits.get(key);
    if (!rec || now - rec.start > windowMs) rec = { start: now, count: 0 };
    rec.count++;
    hits.set(key, rec);
    if (rec.count > max) {
      const retry = Math.ceil((rec.start + windowMs - now) / 60000);
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: message.replace('{m}', retry) });
    }
    next();
  };
}
const authLimiter  = makeLimiter({ windowMs: 15 * 60 * 1000, max: 5,  message: 'Too many attempts — try again in {m} min' });
const regLimiter   = makeLimiter({ windowMs: 15 * 60 * 1000, max: 3,  message: 'Too many signups — try again in {m} min' });
const googleLimiter = makeLimiter({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many Google attempts — try again in {m} min' });

/* ---------- seed data ---------- */
const SEED_MENU = [
  { id:'esp', cat:'Espresso', name:'Espresso', price:2.80, desc:'Double ristretto blend.', seed:'espresso-shot', tags:['signature'], available:true },
  { id:'cor', cat:'Espresso', name:'Cortado', price:3.40, desc:'Equal parts espresso and milk.', seed:'cortado-glass', tags:[], available:true },
  { id:'fw',  cat:'Espresso', name:'Flat White', price:3.90, desc:'Two shots, micro-foam.', seed:'flat-white-art', tags:['signature'], available:true },
  { id:'cap', cat:'Espresso', name:'Cappuccino', price:3.80, desc:'Classic dry cap.', seed:'cappuccino-foam', tags:[], available:true },
  { id:'v60', cat:'Filter', name:'V60 · Ethiopia Guji', price:5.40, desc:'Apricot, bergamot, black tea.', seed:'v60-pourover', tags:['signature'], available:true },
  { id:'chx', cat:'Filter', name:'Chemex · Colombia', price:5.80, desc:'Santa Rita lot.', seed:'chemex-brew', tags:[], available:true },
  { id:'bat', cat:'Filter', name:'Batch Brew', price:3.20, desc:'Today’s roast.', seed:'batch-brew-coffee', tags:[], available:true },
  { id:'cbt', cat:'Cold', name:'Cold Brew Tonic', price:5.60, desc:'16-hour cold brew over tonic.', seed:'cold-brew-tonic', tags:['signature'], available:true },
  { id:'nit', cat:'Cold', name:'Nitro Stout Brew', price:5.90, desc:'Nitrogen-charged cold brew.', seed:'nitro-coldbrew', tags:['new'], available:true },
  { id:'kar', cat:'Bakes', name:'Cardamom Bun', price:4.20, desc:'Knotted, buttery, heavily spiced.', seed:'cardamom-bun', tags:['signature'], available:true },
  { id:'cro', cat:'Bakes', name:'Croissant', price:3.60, desc:'Twenty-seven layers.', seed:'butter-croissant', tags:[], available:true },
  { id:'bas', cat:'Bakes', name:'Basque Cheesecake', price:5.40, desc:'Burnt top, molten centre.', seed:'basque-cheesecake', tags:['gf'], available:true },
];
const SEED_EVENTS = [
  { id:'ev1', day:'14', mon:'Aug · Fri', title:'Open Cupping — August Roasts', desc:'Taste six lots side by side.', time:'17:00 · Old Harbor', seats:4 },
  { id:'ev2', day:'22', mon:'Aug · Sat', title:'Latte Art 101', desc:'Milk science and hearts.', time:'10:30 · Riverside', seats:2 },
  { id:'ev3', day:'27', mon:'Aug · Thu', title:'Brew Better at Home', desc:'V60 fundamentals.', time:'18:30 · Old Harbor', seats:7 },
];

/* ---------- database ---------- */
function load() {
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    const db = { orders: [], newsletter: [], menu: SEED_MENU, events: SEED_EVENTS, activity: [], sessions: [], users: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    return db;
  }
}
const db = load();
if (!db.users || !db.users.length) {
  const adminPass = process.env.ADMIN_PASSWORD || '#199589111822Er';
  db.users = [{ user: 'erscomas', hash: sha(adminPass), role: 'admin', provider: 'password', created: new Date().toISOString() }];
}
db.sessions = (db.sessions || []).filter(s => Date.now() - new Date(s.created).getTime() < SESSION_TTL);

function save() { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); }
save();

const log = msg => {
  db.activity.unshift({ t: new Date().toISOString(), msg });
  db.activity = db.activity.slice(0, 50);
  if (NODE_ENV === 'production') console.log(`[${new Date().toISOString()}] ${msg}`);
};
const money = n => '$' + n.toFixed(2);

/* ---------- auth middleware ---------- */
function getSession(req) {
  const c = parseCookies(req);
  return c.moka_admin ? db.sessions.find(s => s.token === c.moka_admin) : null;
}
const isAdmin = req => !!getSession(req);
const requireAdmin = (req, res, next) =>
  isAdmin(req) ? next() : res.status(401).json({ error: 'Not authenticated' });

function startSession(res, uname) {
  const token = crypto.randomBytes(24).toString('hex');
  const isProd = NODE_ENV === 'production';
  db.sessions.push({ token, user: uname, created: new Date().toISOString() });
  save();
  res.setHeader('Set-Cookie', `moka_admin=${token}; Path=/; HttpOnly; SameSite=${isProd ? 'None' : 'Strict'}; ${isProd ? 'Secure; ' : ''}Max-Age=${SESSION_TTL / 1000}`);
  return token;
}

/* ---------- app ---------- */
const app = express();
app.set('trust proxy', 1);
app.use(express.json());

/* Security headers */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use('/admin.html', (req, res, next) => isAdmin(req) ? next() : res.redirect('/login.html'));
app.use(express.static(path.join(__dirname, 'public')));

/* ================= AUTH ================= */
app.get('/api/auth/google-config', (req, res) =>
  res.json({ enabled: googleEnabled, clientId: googleEnabled ? GOOGLE_CLIENT_ID : null }));

app.post('/api/auth/google', googleLimiter, async (req, res) => {
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'Missing credential' });
  if (!googleEnabled) return res.status(503).json({ error: 'Google sign-in not configured' });
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!r.ok) throw new Error('bad token');
    const c = await r.json();
    if (c.aud !== GOOGLE_CLIENT_ID) throw new Error('wrong audience');
    if (!c.email || c.email_verified !== 'true') throw new Error('email not verified');
    let acct = db.users.find(u => u.googleId === c.sub);
    if (!acct) {
      let base = String(c.email).split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '_').slice(0, 20);
      if (base.length < 3) base = (base + '___').slice(0, 3);
      let uname = base;
      if (db.users.some(u => u.user === uname)) uname = base.slice(0, 15) + '_' + String(c.sub).slice(-4);
      acct = { user: uname, hash: null, role: 'staff', provider: 'google',
        googleId: String(c.sub), email: c.email, name: c.name || uname,
        created: new Date().toISOString() };
      db.users.push(acct);
      log(`Google signup — ${uname} (${c.email})`);
    } else { log(`Google login — ${acct.user}`); }
    startSession(res, acct.user);
    res.json({ ok: true, user: acct.user });
  } catch { log('Rejected Google sign-in'); save(); res.status(401).json({ error: 'Google sign-in failed' }); }
});

app.post('/api/admin/register', regLimiter, (req, res) => {
  const { user, pass } = req.body || {};
  const uname = String(user || '').trim().toLowerCase();
  if (!validUserName(uname)) return res.status(400).json({ error: 'Username: 3–20 letters, numbers, _ . -' });
  if (typeof pass !== 'string' || pass.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (db.users.some(u => u.user === uname)) return res.status(409).json({ error: 'Username already taken' });
  db.users.push({ user: uname, hash: sha(pass), role: 'staff', provider: 'password', created: new Date().toISOString() });
  log(`New staff — ${uname}`); startSession(res, uname); save();
  res.status(201).json({ ok: true, user: uname });
});

app.post('/api/admin/login', authLimiter, (req, res) => {
  const { user, pass } = req.body || {};
  const uname = String(user || '').trim().toLowerCase();
  const acct = db.users.find(u => u.user === uname);
  const ok = acct && acct.hash && typeof pass === 'string' && safeEq(sha(pass), acct.hash);
  if (ok) { log(`Logged in — ${uname}`); startSession(res, uname); return res.json({ ok: true, user: uname }); }
  log('Failed login — ' + (uname || '?')); save();
  res.status(401).json({ error: 'Wrong username or password' });
});

app.post('/api/admin/logout', (req, res) => {
  const c = parseCookies(req);
  db.sessions = db.sessions.filter(s => s.token !== c.moka_admin);
  save();
  res.setHeader('Set-Cookie', 'moka_admin=; Path=/; HttpOnly; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/admin/check', (req, res) =>
  isAdmin(req) ? res.json({ ok: true }) : res.status(401).json({ error: 'Not authenticated' }));

app.get('/api/admin/whoami', requireAdmin, (req, res) => {
  const s = getSession(req);
  const u = db.users.find(u => u.user === s.user);
  res.json({ user: s.user, role: u ? u.role : 'staff' });
});

/* ================= USER MGMT ================= */
app.get('/api/users', requireAdmin, (req, res) =>
  res.json(db.users.map(u => ({ user: u.user, role: u.role, provider: u.provider || 'password',
    email: u.email || null, created: u.created,
    sessions: db.sessions.filter(s => s.user === u.user).length }))));

app.delete('/api/users/:name', requireAdmin, (req, res) => {
  const me = getSession(req).user;
  const target = String(req.params.name).toLowerCase();
  if (me === target) return res.status(400).json({ error: "You can't delete yourself" });
  const i = db.users.findIndex(u => u.user === target);
  if (i < 0) return res.status(404).json({ error: 'User not found' });
  const [gone] = db.users.splice(i, 1);
  db.sessions = db.sessions.filter(s => s.user !== target);
  log(`Admin ${me} deleted ${target}`); save();
  res.json({ ok: true, deleted: gone.user });
});

app.patch('/api/users/:name', requireAdmin, (req, res) => {
  const me = getSession(req).user, target = String(req.params.name).toLowerCase();
  const { role } = req.body || {};
  if (!['admin', 'staff'].includes(role)) return res.status(400).json({ error: 'Bad role' });
  const u = db.users.find(u => u.user === target);
  if (!u) return res.status(404).json({ error: 'User not found' });
  if (me === target && u.role !== role) return res.status(400).json({ error: "Can't change own role" });
  const adminCount = db.users.filter(x => x.role === 'admin').length;
  if (u.role === 'admin' && role === 'staff' && adminCount <= 1) return res.status(400).json({ error: "Can't demote the last admin" });
  u.role = role; log(`Admin ${me} made ${target} a ${role}`); save();
  res.json({ ok: true, user: u.user, role: u.role });
});

app.post('/api/users/:name/logout', requireAdmin, (req, res) => {
  const me = getSession(req).user, target = String(req.params.name).toLowerCase();
  if (!db.users.some(u => u.user === target)) return res.status(404).json({ error: 'User not found' });
  const before = db.sessions.length;
  db.sessions = db.sessions.filter(s => s.user !== target);
  log(`Admin ${me} kicked ${target} (${before - db.sessions.length} sessions)`); save();
  res.json({ ok: true, killed: before - db.sessions.length });
});

/* ================= PUBLIC ================= */
app.get('/api/menu', (req, res) => res.json(db.menu));
app.get('/api/events', (req, res) => res.json(db.events));
app.post('/api/events/:id/rsvp', (req, res) => {
  const ev = db.events.find(e => e.id === req.params.id);
  if (!ev) return res.status(404).json({ error: 'No such event' });
  if (ev.seats <= 0) return res.status(409).json({ error: 'Fully booked' });
  ev.seats--; log(`Seat reserved — ${ev.title}`); save(); res.json(ev);
});
app.delete('/api/events/:id/rsvp', (req, res) => {
  const ev = db.events.find(e => e.id === req.params.id);
  if (!ev) return res.status(404).json({ error: 'No such event' });
  ev.seats = Math.min(40, ev.seats + 1); save(); res.json(ev);
});
app.post('/api/orders', (req, res) => {
  const { items, pickup } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Empty tray' });
  const lines = [];
  for (const { id, qty } of items) {
    const m = db.menu.find(x => x.id === id);
    if (!m) return res.status(400).json({ error: 'Unknown item on tray' });
    if (m.available === false) return res.status(409).json({ error: `${m.name} sold out` });
    lines.push({ id: m.id, name: m.name, price: m.price, qty: Math.max(1, Math.min(20, Math.trunc(qty) || 0)) });
  }
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  let no; do { no = 'MH-' + (1000 + Math.floor(Math.random() * 9000)); } while (db.orders.some(o => o.no === no));
  db.orders.unshift({ no, items: lines, subtotal, pickup: pickup || 'ASAP', status: 'queued', created: new Date().toISOString() });
  log(`Order ${no} — ${money(subtotal)}`); save();
  res.status(201).json(db.orders[0]);
});
app.post('/api/newsletter', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
  if (!db.newsletter.some(s => s.email === email)) {
    db.newsletter.unshift({ email, t: new Date().toISOString() });
    log(`Roast-list — ${email}`); save();
  }
  res.status(201).json({ ok: true });
});

/* ================= ADMIN ================= */
app.patch('/api/menu/:id', requireAdmin, (req, res) => {
  const item = db.menu.find(m => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const { available, price } = req.body || {};
  if (typeof available === 'boolean') { item.available = available; log(`${item.name} ${available ? 'on' : 'off'} board`); }
  if (Number.isFinite(price) && price >= 0.5 && price <= 50) { item.price = Math.round(price * 100) / 100; log(`${item.name} → ${money(item.price)}`); }
  save(); res.json(item);
});
app.patch('/api/events/:id', requireAdmin, (req, res) => {
  const ev = db.events.find(e => e.id === req.params.id);
  if (!ev) return res.status(404).json({ error: 'Not found' });
  const { delta } = req.body || {};
  if (typeof delta === 'number') ev.seats = Math.max(0, Math.min(40, ev.seats + Math.trunc(delta)));
  save(); res.json(ev);
});
app.get('/api/orders', requireAdmin, (req, res) => res.json(db.orders));
app.patch('/api/orders/:no', requireAdmin, (req, res) => {
  const o = db.orders.find(o => o.no === req.params.no);
  if (!o) return res.status(404).json({ error: 'Not found' });
  const { status } = req.body || {};
  if (!FLOW.includes(status)) return res.status(400).json({ error: 'Bad status' });
  o.status = status; log(`${o.no} → ${status}`); save(); res.json(o);
});
app.delete('/api/orders/:no', requireAdmin, (req, res) => {
  const i = db.orders.findIndex(o => o.no === req.params.no);
  if (i < 0) return res.status(404).json({ error: 'Not found' });
  const [gone] = db.orders.splice(i, 1);
  log(`${gone.no} voided`); save(); res.json({ ok: true });
});
app.get('/api/stats', requireAdmin, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const todays = db.orders.filter(o => o.created.slice(0, 10) === today);
  const revenue = todays.reduce((s, o) => s + o.subtotal, 0);
  const tally = {}; todays.forEach(o => o.items.forEach(i => tally[i.name] = (tally[i.name] || 0) + i.qty));
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  res.json({ orders: todays.length, revenue, avg: todays.length ? revenue / todays.length : 0,
    top: top ? { name: top[0], qty: top[1] } : null,
    queued: db.orders.filter(o => o.status === 'queued').length });
});
app.get('/api/newsletter', requireAdmin, (req, res) => res.json(db.newsletter));
app.get('/api/activity', requireAdmin, (req, res) => res.json(db.activity));

/* Health check for Render */
app.get('/health', (req, res) => res.json({ ok: true, env: NODE_ENV, users: db.users.length }));

app.listen(PORT, () => console.log(
`\n   ☕ MOKA HOUSE · ${NODE_ENV}
   → http://localhost:${PORT}
   Google: ${googleEnabled ? '✅' : '⚠️  set GOOGLE_CLIENT_ID'}
   Rate limit: ✅ active\n`));