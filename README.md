# ☕ MOKA HOUSE — Roastery & Espresso Bar

Full-stack coffee-shop platform — storefront, orders, payments, AI barista bot,
multi-language (8), staff roles & a live admin dashboard.

🔗 **Live:** https://moka-house.vercel.app

Built by **Ermias Amare** · amareermias3@gmail.com · +251 976 021 007

---

## ✨ Features

### 🛍️ Storefront
- Live menu (Espresso / Filter / Cold / Bakes) with categories & sold-out states
- Tray (cart) + checkout with **6 payment methods** (Telebirr, M-Pesa, PayPal, Card, Bank, Crypto)
- **Order tracking** — `/track.html` with live status timeline (queued → brewing → ready → picked-up)
- Brew Lab (V60 / Chemex / AeroPress / French Press / Espresso) with live timer
- 3 shops with real-time open/closed status · Stamp card · Events & RSVP · Posts · Newsletter

### 🌍 Languages (8)
አማርኛ · English · العربية (RTL) · Français · Español · Afaan Oromoo · ትግርኛ · Soomaali

### 🤖 AI Barista Bot
Answers about menu, prices, hours, locations, payments, brewing, events & news —
and **learns instantly** from anything added in the admin panel (menu items, posts, events, custom knowledge).

### 👥 Accounts & Roles
- Register with **name + email + phone + password** or **Google**
- Roles: `admin → moderator → staff → customer` with per-moderator permissions
- Portable signed sessions (works across serverless instances)

### 📊 Admin Dashboard
- Stats: today's orders/revenue, 7-day revenue chart, top item, totals
- Orders board (live), menu editor, posts, events, team & permissions
- 💰 Wallet: balance, transactions, transfers · ⬇ CSV / JSON export & full backup

---

## 🛠️ Tech Stack

- **Backend:** Node.js + Express (single `server.js`, JSON DB layer)
- **Database:** Supabase (PostgreSQL) sync + local fallback
- **Hosting:** Vercel (serverless) · `vercel.json` rewrites → `api/index.js`
- **Auth:** Google Identity Services + HMAC-signed session cookies
- **Frontend:** Vanilla JS/CSS (Fraunces + Space Grotesk + Space Mono), PWA-installable, SEO/OG tags

---

## 🚀 Run locally

```bash
npm install
npm start
# → http://localhost:3000