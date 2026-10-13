# WooCommerce CRM

A lightweight CRM for WooCommerce stores. It imports customers and orders from a
WordPress + WooCommerce shop, segments customers automatically, tracks orders and
what was bought, and helps you follow up with the right customers at the right time.

**Stack:** React 19 + Vite · Node.js + Express 5 · MySQL 8 · WooCommerce REST API (v3)

---

## Features

**Customer data management**
- Customer list with search (name, email, phone), sorting and pagination
- Automatic segments: **New**, **Repeat**, **High-Value** (thresholds configurable)
- Customer profile: lifetime spend, order count, average order value, purchase history with products

**Order tracking**
- Orders table with status tabs, date range, minimum total and product search
- Products bought in every order (synced from WooCommerce line items)
- "Live" mode refreshes the order list every 30 seconds
- Dashboard: totals, revenue, pending orders, recent activity, top products, segment breakdown

**Communication workflows**
- Interaction notes per customer (note / call / email / meeting)
- Follow-up tasks with due dates, priorities, overdue highlighting, reschedule and check-off
- **Suggested actions**, generated from rules:
  - Unresolved orders (pending / on-hold / failed for more than 24 hours)
  - High-Value customers not contacted in 30 days
  - Repeat customers with no order in 60+ days (win-back)
- Turn any suggestion into a task with one click

**WooCommerce integration**
- One-click **Sync WooCommerce** button, `npm run sync`, or automatic sync on a timer
- Safe to re-run: existing customers and orders are updated, never duplicated
- Guest checkouts are matched to customers by billing email

**Extras:** $ USD / ₹ INR display switch with an editable exchange rate, dark mode, mobile-friendly layout, demo data generator.

---

## Project structure

```
wooconmerce-crm/
├── backend/                  Express API
│   ├── config/               MySQL pool, order-status groups
│   ├── database/schema.sql   All tables
│   ├── middleware/           Error handling
│   ├── routes/               customers, orders, communications, sync
│   ├── scripts/              initDb, seedDemo, syncWoo
│   ├── services/             segmentation, stats, follow-up rules, WooCommerce client + sync
│   └── .env.example          Copy to .env
├── frontend/                 React + Vite app
│   └── src/
│       ├── components/       Layout, notes, tasks, currency switch, shared UI
│       ├── hooks/            Data fetching, URL filters, tasks, currency
│       ├── pages/            Dashboard, Customers, CustomerProfile, Orders, FollowUps
│       └── services/api.js   All API calls
└── wordpress/
    └── products.csv          Sample products to import into WooCommerce
```

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| [Node.js](https://nodejs.org) | 20 or newer | Developed on Node 24 |
| [MySQL](https://dev.mysql.com/downloads/) | 8.0+ | Must be running, with a user that can create databases |
| [LocalWP](https://localwp.com) | latest | **Optional.** Only needed to run a local WooCommerce shop |

---

## Quick start (with demo data, no WooCommerce needed)

The commands below are for PowerShell on Windows. They work the same in macOS/Linux terminals, apart from `copy` (use `cp`).

### 1. Clone and install

```powershell
git clone https://github.com/RiyaShetgaonkar/wooconmerce-crm.git
cd wooconmerce-crm

cd backend
npm install
cd ..\frontend
npm install
cd ..
```

### 2. Configure the backend

```powershell
cd backend
copy .env.example .env
```

Open `backend/.env` and set your MySQL password:

```
DB_PASSWORD=your_mysql_password
```

### 3. Create the database and load demo data

```powershell
npm run db:init     # creates the woocommerce_crm database and all tables
npm run db:seed     # optional: 32 demo customers, orders, notes and tasks
```

### 4. Start the app (two terminals)

```powershell
# Terminal 1: backend API, http://localhost:5000/api
cd backend
npm start
```

```powershell
# Terminal 2: frontend, http://localhost:5173
cd frontend
npm run dev
```

Open **http://localhost:5173**. The sidebar should show **"API connected"**.

> **After changing backend code**, stop the backend (Ctrl+C) and run `npm start` again.
> Frontend changes reload automatically.

---

## Connecting a WooCommerce shop (WordPress + LocalWP)

This is how the project's test shop **"My Shop"** (`http://my-shop.local`) was set up.

### 1. Create the WordPress site
1. Install and open **LocalWP**.
2. Click **+** → **Create a new site** → name it `My Shop` → keep the default (Preferred) environment.
3. Choose an admin username, password and email → **Add site**.
4. Make sure the site is **running** (green dot). Its address is `http://my-shop.local`.

### 2. Install WooCommerce
1. In Local, click **WP Admin** and log in.
2. **Plugins → Add New Plugin** → search **WooCommerce** → **Install Now** → **Activate**.
3. Skip or complete the setup wizard. The test shop uses **US Dollar ($)**.
4. **Settings → Permalinks** → choose **Post name** → **Save** (the REST API needs this).

### 3. Add products
Import the sample products:

1. **Products → Import** → **Choose file** → select `wordpress/products.csv` from this repo.
2. Click **Continue** → **Run the importer**.

| Product | Price |
|---|---|
| Classic Cotton T-Shirt | $9 |
| Ceramic Coffee Mug Set (4 pcs) | $15 |
| Wireless Earbuds Pro | $29 |
| Leather Laptop Bag | $49 |
| Smart Fitness Watch | $89 |

### 4. Enable a payment method
**WooCommerce → Settings → Payments** → turn on **Cash on delivery** → **Save changes**.

### 5. Place test orders
Either:
- **As a customer:** open a private browser window → `http://my-shop.local/shop/` → **Add to cart** → **Cart** → **Proceed to checkout** → fill in the details → **Cash on delivery** → **Place order**.
- **As admin:** **WooCommerce → Orders → Add order** → fill in billing details → **Add product(s)** → **Recalculate** → choose a status → **Create**.

Suggested test data, covering every segment and suggestion:

| Customer | Email | Buys | Set status to |
|---|---|---|---|
| Priya Sharma | priya@example.com | Smart Fitness Watch | Completed |
| Priya Sharma | priya@example.com | Leather Laptop Bag | Completed |
| Rahul Mehta | rahul@example.com | T-Shirt + Mug Set | Completed |
| Rahul Mehta | rahul@example.com | T-Shirt | Processing |
| Ananya Iyer | ananya@example.com | Wireless Earbuds Pro | Completed |
| Karan Naik | karan@example.com | Leather Laptop Bag | Pending payment |

Use a different email per customer. The CRM groups guest orders by billing email.

### 6. Create REST API keys
1. **WooCommerce → Settings → Advanced → REST API → Add key**
   (direct link: `http://my-shop.local/wp-admin/admin.php?page=wc-settings&tab=advanced&section=keys`)
2. Description `CRM`, User = your admin, Permissions **Read** → **Generate API key**.
3. Copy the **Consumer key** (`ck_…`) and **Consumer secret** (`cs_…`). They are shown only once.

### 7. Add the keys to `backend/.env`

```
WC_STORE_URL=http://my-shop.local
WC_CONSUMER_KEY=ck_your_key_here
WC_CONSUMER_SECRET=cs_your_secret_here
SEGMENT_HIGH_VALUE_SPEND=100
```

- Use **`http://`** for LocalWP sites. The backend signs requests with OAuth 1.0a over HTTP and uses Basic auth over HTTPS automatically.
- `SEGMENT_HIGH_VALUE_SPEND=100` suits the low test prices. Raise it for a real store.

### 8. Sync

```powershell
cd backend
npm run db:unseed   # optional: remove demo data so only shop data is shown
npm run sync        # import customers, orders and order items
npm start           # restart the API so the Sync button is enabled
```

Expected output:

```
🔄 Syncing from WooCommerce...
✅ Fetched 0 customers and 6 orders
   Customers: 4 new, 0 updated
   Orders:    6 new, 0 updated
```

"0 customers" is normal when everyone checked out as a guest. Customers are created from their orders.

After placing or changing orders in WooCommerce, click **⇅ Sync WooCommerce** on the Dashboard,
or set `WC_SYNC_INTERVAL_MINUTES=1` in `backend/.env` to sync automatically.

> Keep the LocalWP site **running** whenever you sync.

---

## All commands

### Backend (`cd backend`)

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm start` | Start the API on http://localhost:5000/api |
| `npm run db:init` | Create the database and tables (safe to re-run) |
| `npm run db:seed` | Replace demo data with a fresh set (only `@demo.test` customers) |
| `npm run db:unseed` | Remove demo data only |
| `npm run sync` | Import customers + orders + items from WooCommerce |

### Frontend (`cd frontend`)

| Command | What it does |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start the dev server on http://localhost:5173 |
| `npm run build` | Production build into `frontend/dist` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint with oxlint |

### Typical day-to-day

```powershell
# 1. Start MySQL and the LocalWP site ("My Shop") if they aren't running
# 2. Terminal 1
cd backend;  npm start
# 3. Terminal 2
cd frontend; npm run dev
# 4. Open http://localhost:5173 and click "Sync WooCommerce"
```

---

## Configuration

### `backend/.env`

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | API port |
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `3306` | MySQL server |
| `DB_USER` / `DB_PASSWORD` | `root` / empty | MySQL credentials |
| `DB_NAME` | `woocommerce_crm` | Database name |
| `CORS_ORIGIN` | `http://localhost:5173,http://localhost:3000` | Allowed frontend origins |
| `SEGMENT_HIGH_VALUE_SPEND` | `500` | Spend needed to be **High-Value** |
| `SEGMENT_REPEAT_ORDERS` | `2` | Orders needed to be **Repeat** |
| `FOLLOWUP_UNRESOLVED_HOURS` | `24` | Age before a pending/on-hold/failed order is flagged |
| `FOLLOWUP_CONTACT_GAP_DAYS` | `30` | Days without a note before a VIP is flagged |
| `FOLLOWUP_LAPSED_DAYS` | `60` | Days without an order before a win-back is suggested |
| `WC_STORE_URL` | none | Shop address, e.g. `http://my-shop.local` |
| `WC_CONSUMER_KEY` / `WC_CONSUMER_SECRET` | none | WooCommerce REST API keys (Read access is enough) |
| `WC_SYNC_INTERVAL_MINUTES` | off | Auto-sync interval in minutes |

### `frontend/.env` (optional)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5000/api` | Backend URL |
| `VITE_STORE_CURRENCY` | `USD` | Currency the shop records prices in (`USD` or `INR`) |
| `VITE_INR_PER_USD` | `88` | Default rate for the $ / ₹ switch (editable in the sidebar) |

Restart `npm run dev` after changing `frontend/.env`.

---

## How the rules work

| Segment | Rule |
|---|---|
| **High-Value** | Has ordered, and total spend ≥ `SEGMENT_HIGH_VALUE_SPEND` |
| **Repeat** | Order count ≥ `SEGMENT_REPEAT_ORDERS` |
| **New** | Everyone else |

Only **completed, processing and on-hold** orders count towards spend and revenue.
**Pending, processing and on-hold** orders count as "pending" on the Dashboard.

Suggested follow-ups skip any customer who already has an open task, and each customer gets at most one suggestion.

---

## API reference

Base URL: `http://localhost:5000/api`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | API and database status |
| GET | `/dashboard/stats` | Totals, recent orders, top products, segments, task counts |
| GET | `/customers` | List. Query: `search, segment, min_spent, min_orders, sort, order, page, limit` |
| GET | `/customers/segments` | Count and revenue per segment |
| GET | `/customers/:id` | Profile with orders (and items), notes, tasks |
| GET | `/orders` | List. Query: `status, customer_id, from, to, min_total, search, sort, order, page, limit` |
| GET | `/orders/:id` | Single order |
| GET / POST | `/customers/:id/notes` | List / add notes. Body: `{ content, note_type }` |
| DELETE | `/notes/:id` | Delete a note |
| GET | `/follow-ups` | Tasks + suggested actions. Query: `status, customer_id` |
| POST | `/follow-ups` | Create a task. Body: `{ customer_id, title, due_date, priority }` |
| PATCH | `/follow-ups/:id` | Update a task: `status`, `due_date`, `title`, `priority` |
| DELETE | `/follow-ups/:id` | Delete a task |
| GET | `/sync` | WooCommerce connection status and last sync result |
| POST | `/sync` | Run a WooCommerce sync now |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Sidebar says **"API offline"** | Start the backend: `cd backend` then `npm start` |
| `Could not connect to MySQL` | Start MySQL; check `DB_USER` / `DB_PASSWORD` in `backend/.env` |
| `WooCommerce is not configured` | Set `WC_STORE_URL`, `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`; `WC_STORE_URL` must not be the placeholder |
| `WooCommerce rejected the API keys` | Regenerate keys with **Read** permission and paste them again |
| `WooCommerce API not found` | Activate WooCommerce; set **Settings → Permalinks** to **Post name** |
| `Can't reach the store` | Start the site in LocalWP; use `http://`, not `https://` |
| Sync says **0 orders** | The shop has no orders yet; place one (see step 5) |
| New features missing / old data shape | Restart the backend after pulling or editing backend code |
| Checkout says "no payment methods" | Enable **Cash on delivery** in WooCommerce → Settings → Payments |

---

## Security notes

- `backend/.env` holds your database password and WooCommerce keys. It is git-ignored, so never commit it.
- WooCommerce keys only need **Read** permission.
- Demo data uses `@demo.test` emails, and `db:seed` / `db:unseed` never touch other customers.
