# DxbDipFinder - Admin Dashboard

Read-only analytics dashboard for [dxpdipfinder.com](https://dxpdipfinder.com). Displays user interaction data collected from the main app.

## Architecture

- **Data source:** Supabase `DDP_analytics` table (populated by the Express analytics route on dxpdipfinder.com)
- **Frontend:** React 18 + Vite, Recharts, plain CSS
- **Hosting:** Vercel (auto-deploys on `git push main`)
- **Domain:** `admin.dxpdipfinder.com`

## One-Time Setup

### 1. Supabase Table

Run `supabase-setup.sql` (in the main dip-finder repo) in the Supabase SQL Editor. This creates the `DDP_analytics` table with RLS policies.

### 2. Vercel

1. Create a new project on [vercel.com](https://vercel.com) and connect this GitHub repo
2. Set these environment variables in the Vercel dashboard:
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_SERVICE_KEY` — your Supabase service role key
   - `VITE_ADMIN_PASSWORD` — choose a strong password for dashboard access
3. Add custom domain: `admin.dxpdipfinder.com`
4. Deploy

## Making Changes

```
# Edit code locally
git add . && git commit -m "description" && git push
# Vercel auto-deploys within ~30 seconds — no local build needed
```

## Changing the Admin Password

1. Go to Vercel dashboard → Settings → Environment Variables
2. Update `VITE_ADMIN_PASSWORD`
3. Redeploy (Deployments → latest → Redeploy)

## Tracked Events

| Event | Description | Fired from |
|---|---|---|
| `pageview` | Page loaded or route changed | App.jsx (on mount + route change) |
| `filter` | User applied search filters | FilterSheet (mobile) / Feed (desktop) |
| `click` | Button interaction | Bookmark button, "View on [source]" links |
| `property_view` | Property detail viewed | ListingDetail page |
| `session_end` | Tab/window closed | beforeunload listener |

All events include: session ID, page path, user agent, referrer. Logged-in users also have their email attached.
