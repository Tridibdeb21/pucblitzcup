# PostgreSQL Setup Guide for Render

This guide walks you through setting up PostgreSQL database on Render hosting for the PUC Blitz Cup application.

## Step 1: Update Dependencies

Run this command to install the new PostgreSQL driver (replaces sqlite3):

```bash
npm install
```

This will install the `pg` package instead of `sqlite3`.

---

## Step 2: Create PostgreSQL Database on Render

### Option A: If you already have a Render account

1. Go to https://dashboard.render.com
2. Click **"New +"** on the top-right
3. Select **"PostgreSQL"**
4. Fill in the details:
   - **Name**: `pucblitzcup-db` (or your choice)
   - **Database**: Leave as `postgres`
   - **User**: Leave as `postgres`
   - **Region**: Choose closest to your users
   - **Plan**: Start with "Free" tier for testing
5. Click **"Create Database"**

> **Note**: Free tier PostgreSQL instances spin down after 15 minutes of inactivity. Upgrade to Starter plan for production.

### Option B: If you don't have a Render account

1. Visit https://render.com
2. Click **"Get Started"**
3. Sign up with GitHub, Google, or email
4. Follow Option A above

---

## Step 3: Connect Your Web Service to the Database

After creating the database, you should see an **Internal Database URL** and **External Database URL**.

### For your existing Render web service:

1. Go to your web service in Render dashboard
2. Click **"Environment"** tab
3. Add a new environment variable:
   - **Key**: `DATABASE_URL`
   - **Value**: Copy the **Internal Database URL** from your PostgreSQL instance
4. Click **"Save Changes"**

The service will automatically redeploy with the new variable.

---

## Step 4: Deploy to Render

If you haven't deployed yet:

1. Push your code to GitHub:
   ```bash
   git add .
   git commit -m "Add PostgreSQL support"
   git push
   ```

2. In Render dashboard, create a new Web Service:
   - Click **"New +"** → **"Web Service"**
   - Connect your GitHub repository
   - Set **Build Command**: `npm install`
   - Set **Start Command**: `npm start`
   - Set **PORT**: `3000` (default)
   - Click **"Create Web Service"**

3. Go to **"Environment"** tab and add `DATABASE_URL` as shown in Step 3

---

## Step 5: Verify Connection

After deployment:

1. Check the Render logs to confirm:
   - `Connected to PostgreSQL database`
   - `CREATE TABLE IF NOT EXISTS results...`

2. Test by making a request to your web service - if there are no errors, your database is working!

---

## Important Notes

### For Local Development

If you want to test locally before deploying:

1. **Option A**: Install PostgreSQL locally and set `DATABASE_URL`:
   ```bash
   # On Windows Command Prompt
   set DATABASE_URL=postgresql://username:password@localhost:5432/blitz_db
   npm start
   ```

2. **Option B**: Use the Render database from local (slower, includes network latency):
   ```bash
   set DATABASE_URL=postgresql://postgres:PASSWORD@HOST:5432/postgres
   npm start
   ```

### Free Tier Limitations

- Spins down after 15 minutes of inactivity
- Might see brief connection delays on first request after idle period
- **Recommended**: Upgrade to Starter ($7/month) for production use

### Backup Your Data

To backup your database from Render:

1. Go to your PostgreSQL instance dashboard
2. Look for backup options
3. Or connect with a PostgreSQL client and export data

---

## Troubleshooting

### Error: "DATABASE_URL not configured"

**Solution**: Make sure you've set the `DATABASE_URL` environment variable in Render dashboard.

### Error: "could not connect to PostgreSQL"

**Solution**: 
- Check that your PostgreSQL instance is running (green status in Render dashboard)
- Verify the DATABASE_URL is copied correctly
- Wait a minute - Render sometimes takes time to initialize the database

### Application running but no data

**Solution**: This is normal for fresh start. Old SQLite data was separate. You're starting fresh with PostgreSQL.

---

## Next Steps

1. ✅ Code updated to use PostgreSQL
2. ✅ Database created on Render
3. ✅ Environment variable configured
4. ✅ Web service deployed
5. 📊 Start collecting data in PostgreSQL!

For issues, check the Render dashboard **"Logs"** tab for error messages.
