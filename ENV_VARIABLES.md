# Environment Variables Reference

When deploying to Render, you need to set this environment variable:

## Required

### `DATABASE_URL`
- **Type**: PostgreSQL connection string  
- **Example**: `postgresql://postgres:PASSWORD@hostname:5432/postgres`
- **Where to get it**: 
  - Go to your PostgreSQL instance in Render dashboard
  - Copy the **"Internal Database URL"** (for services on same Render account)
  - Or **"External Database URL"** (for connecting from outside Render)
- **How to set it**: 
  - In Render dashboard → Your Web Service → Environment tab → Add new variable

## Optional

### `PORT` (usually set to 3000)
- Already configured by Render, but you can override
- Default: `3000`

### `NODE_ENV` (for production)
- Set to `production` for optimizations
- Not required, but recommended

---

## Local Development

To test locally before deploying:

### Option 1: Local PostgreSQL
```bash
# Windows Command Prompt
set DATABASE_URL=postgresql://postgres:your_password@localhost:5432/blitz_db
npm start
```

### Option 2: Render's PostgreSQL (slower, includes network latency)
```bash
# Windows Command Prompt
set DATABASE_URL=postgresql://postgres:PASSWORD@hostname.onrender.com:5432/postgres
npm start
```

### Option 3: Windows PowerShell
```powershell
$env:DATABASE_URL = "postgresql://postgres:your_password@localhost:5432/blitz_db"
npm start
```

---

## Checking if Connection Works

1. Start your server
2. Look for this message in logs:
   ```
   Connected to PostgreSQL database
   ```
3. If you see this, your DATABASE_URL is configured correctly!

---

## Getting Your Database URL from Render

1. Go to https://dashboard.render.com
2. Click on your PostgreSQL instance (e.g., "pucblitzcup-db")
3. You'll see both URLs:
   - **Internal Database URL** - Use this for services within Render
   - **External Database URL** - Use this for outside connections
4. Copy the appropriate URL to your clipboard

---

## Security Tips

- Never commit your `DATABASE_URL` to Git (it contains your password!)
- Always use environment variables
- The `.gitignore` file should already prevent accidental commits
- On Render, the DATABASE_URL is secure since it's stored in their system

