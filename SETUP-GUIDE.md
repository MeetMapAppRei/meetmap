# 🚗 MEET MAP — Complete Setup Guide

### For beginners — step by step, no experience needed

---

## WHAT YOU'LL NEED (all free)

- A computer with internet
- A free Supabase account (your database + login + photo storage)
- A free Mapbox account (your live map)
- A free Vercel account (to put the app online)
- Node.js installed on your computer (explained below)

Estimated time: ~30–45 minutes

---

## STEP 1 — Install Node.js on your computer

1. Go to **https://nodejs.org**
2. Click the big green button that says **"LTS"** (recommended version)
3. Download and run the installer — click Next through all the steps
4. When done, open your **Terminal** (Mac) or **Command Prompt** (Windows)
5. Type `node --version` and press Enter — you should see something like `v20.11.0`

---

## STEP 2 — Set up your Supabase database

1. Go to **https://supabase.com** and click **"Start your project"**
2. Sign up with GitHub or email
3. Click **"New Project"** → choose a name like `meetmap` → set a database password → click **Create**
4. Wait ~2 minutes for it to set up

### Run the database setup:

5. In your Supabase project, click **"SQL Editor"** in the left sidebar
6. Click **"New query"**
7. Open the file `supabase-schema.sql` from this project folder
8. Copy ALL the text and paste it into the SQL Editor
9. Click **"Run"** (green button) — you should see "Success"

### Get your API keys:

10. In Supabase, click **"Settings"** (gear icon, left sidebar) → **"API"**
11. Copy the **"Project URL"** — looks like `https://abcxyz.supabase.co`
12. Copy the **"anon public"** key — a long string of letters and numbers
13. Open the file `src/lib/supabase.js` in this project
14. Replace `YOUR_SUPABASE_URL` with your Project URL
15. Replace `YOUR_SUPABASE_ANON_KEY` with your anon key

---

## STEP 3 — Set up your Mapbox map

1. Go to **https://mapbox.com** and click **"Sign up"**
2. Sign up for a free account (no credit card needed for free tier)
3. Once logged in, click your profile icon (top right) → **"Account"**
4. Scroll down to **"Access tokens"** → copy the **"Default public token"**
5. Open the file `src/components/MapView.jsx` in this project
6. Replace `YOUR_MAPBOX_PUBLIC_TOKEN` with your token

---

## STEP 4 — Run the app on your computer

1. Open **Terminal** (Mac) or **Command Prompt** (Windows)
2. Navigate to the project folder. For example:

   ```
   cd Downloads/meetmap
   ```

   (adjust the path to wherever you saved the project folder)

3. Install dependencies — type this and press Enter:

   ```
   npm install
   ```

   Wait for it to finish (~1-2 minutes)

4. Start the app — type this and press Enter:

   ```
   npm run dev
   ```

5. Open your browser and go to **http://localhost:5173**
6. You should see Meet Map running! 🎉

---

## STEP 5 — Put it online with Vercel (free)

1. Go to **https://vercel.com** and sign up (use GitHub for easiest setup)
2. Click **"Add New Project"**
3. Upload your project folder OR connect your GitHub repo
4. Vercel will auto-detect it's a Vite app — just click **"Deploy"**
5. In ~2 minutes your app will be live at a URL like `https://meetmap-yourname.vercel.app`

---

## OPTIONAL: Add a custom domain

1. In Vercel, go to your project → **"Settings"** → **"Domains"**
2. Add a domain like `meetmap.com` (you'd need to buy this, ~$12/year at namecheap.com)
3. Follow Vercel's instructions to point your domain — takes ~10 minutes

---

## TROUBLESHOOTING

**"Cannot find module" error when running npm install:**

- Make sure you're in the right folder (the one containing `package.json`)

**Map not showing up:**

- Double-check your Mapbox token in `src/components/MapView.jsx`
- Make sure there are no extra spaces when you pasted it

**Events not loading / login not working:**

- Double-check your Supabase URL and key in `src/lib/supabase.js`
- Make sure you ran the SQL schema — go back to Supabase SQL Editor and run it again

**Photos not uploading:**

- In Supabase, go to **Storage** in the left sidebar
- Make sure a bucket called `event-photos` exists
- If not, run the last section of `supabase-schema.sql` again

---

## PROJECT FILE STRUCTURE

```
meetmap/
├── index.html                  ← App entry point
├── package.json                ← Dependencies list
├── vite.config.js              ← Build config
├── supabase-schema.sql         ← Run this in Supabase SQL Editor
├── SETUP-GUIDE.md              ← This file!
└── src/
    ├── main.jsx                ← React entry point
    ├── App.jsx                 ← Main app (header, list, nav)
    ├── lib/
    │   ├── supabase.js         ← 🔑 ADD YOUR SUPABASE KEYS HERE
    │   └── AuthContext.jsx     ← Login state management
    └── components/
        ├── AuthModal.jsx       ← Login / signup screen
        ├── PostEventForm.jsx   ← Post a new event form
        ├── EventCard.jsx       ← Event card in the list
        ├── EventDetail.jsx     ← Full event page + comments
        └── MapView.jsx         ← 🔑 ADD YOUR MAPBOX TOKEN HERE
```

---

## COSTS (everything used here is free)

| Service  | Free tier                        | Paid starts at |
| -------- | -------------------------------- | -------------- |
| Supabase | 500MB DB, 1GB storage, 50K users | $25/mo         |
| Mapbox   | 50,000 map loads/month           | $5/mo          |
| Vercel   | Unlimited hobby projects         | $20/mo         |

For a local car meet app, you'll likely **never need to pay** unless it gets very popular.

---

## QUESTIONS?

If you get stuck, the most helpful places are:

- **Supabase docs**: docs.supabase.com
- **Mapbox docs**: docs.mapbox.com/mapbox-gl-js
- **Vite docs**: vitejs.dev

Good luck — go build the scene! 🚗🔥
