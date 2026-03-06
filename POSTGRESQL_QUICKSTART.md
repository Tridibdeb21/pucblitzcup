# Quick PostgreSQL Setup Checklist

## ✅ Code Changes (Already Done)

- [x] Updated `package.json` - replaced sqlite3 with pg
- [x] Updated `server.js` - PostgreSQL connection logic
- [x] All SQL queries converted to PostgreSQL format

## 📋 To-Do Steps

### Step 1: Local Setup
```bash
npm install
```

### Step 2: Create PostgreSQL on Render

Visit: https://dashboard.render.com

1. Click "New +" → "PostgreSQL"
2. Name it `pucblitzcup-db`
3. Choose your region
4. Select "Free" plan (for testing) or "Starter" (for production)
5. Click "Create Database"
6. **Copy your Internal Database URL** (you'll use this next)

### Step 3: Configure Web Service

In Render Dashboard:

1. Go to your Web Service
2. Click "Environment" tab
3. Add new environment variable:
   - **Key**: `DATABASE_URL`
   - **Value**: Paste your PostgreSQL URL from Step 2
4. Click "Save Changes"
5. Wait for redeployment (~2 minutes)

### Step 4: Push Your Code

```bash
git add .
git commit -m "Add PostgreSQL support"
git push origin main
```

Render will automatically redeploy.

### Step 5: Verify

Check your Render logs (Dashboard → Your Service → Logs) for:

✅ `Connected to PostgreSQL database`

If you see that, you're done! 🎉

---

## Helpful Links

- **Render Dashboard**: https://dashboard.render.com
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **Node.js pg package**: https://node-postgres.com/

---

## Questions?

See the detailed guides:
- [POSTGRESQL_SETUP.md](./POSTGRESQL_SETUP.md) - Full setup guide
- [ENV_VARIABLES.md](./ENV_VARIABLES.md) - Environment variables reference

---

## Summary of What Changed

| Aspect | Before | After |
|--------|--------|-------|
| Database | SQLite3 (file-based) | PostgreSQL (cloud-based) |
| Storage | Local file | Render-hosted |
| Data Persistence | Lost on restart | Persistent across restarts |
| Persistence | `blitz.db` file in folder | PostgreSQL instance |
| npm package | sqlite3 | pg |

Your original data is NOT carried over - you're starting fresh with PostgreSQL. This is fine because:
- SQLite data was temporary/test data
- Production systems should start fresh with proper DB
- Old JSON files can always be imported manually if needed

