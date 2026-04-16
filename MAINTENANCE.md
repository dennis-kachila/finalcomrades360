# Comrades360 Production Stability Manual 🚀🏆

We have successfully transformed the Comrades360 backend into a high-performance, stable production server capable of running on restricted shared hosting environments (cPanel/Passenger/TrueHost).

## 🛠️ Achievements Summary

1.  **Resolved "Double Listen" Crashes**: Implemented a **Singleton Startup Protector** and a **Port Binding Lock**. The server no longer crashes when multiple Passenger workers start.
2.  **Fixed "404 API" Errors**: Implemented **Middleware Re-Ordering**. API routes are now matched before the React SPA or the 404 handler.
3.  **Eliminated "Startup Hangs"**: Implemented **Lazy-Loading** for all 35+ routes and **Deferred Initialization** for 61+ models.
4.  **Ultra-Fast Boot**: The server now binds to its port in under **1 second**, preventing the cPanel "watchdog" from killing the process during long load times.
5.  **WhatsApp Visibility**: Mirrored all WhatsApp engine logs to the error stream (`stderr.log`) so you can watch for the QR code in real-time.

---

## 📖 The "Make It Work" Manual

Whenever you deploy new code or the server seems unresponsive, follow these exact steps to restore full functionality.

### 1. The Deployment Sync (Updates)
Run this when you have pushed new code to GitHub and need it live:
```bash
# Pull fresh code
cd /home/vdranjxy/production/finalcomrades360 && git pull origin main

# Sync the CORE stabilization files
cp backend/server.js /home/vdranjxy/comrades-backend/server.js
cp backend/database/database.js /home/vdranjxy/comrades-backend/database/database.js
cp backend/utils/messageService.js /home/vdranjxy/comrades-backend/utils/messageService.js
cp backend/scripts/services/cacheService.js /home/vdranjxy/comrades-backend/scripts/services/cacheService.js
```

### 2. The "Nuclear" Restart (Stability)
Run this to ensure old "ghost" processes are dead and logs are clean:
```bash
# Kill old processes & Wipe logs
pkill -9 -u vdranjxy node && \
> /home/vdranjxy/comrades-backend/stderr.log
```
**Then:** Go to cPanel and click **RESTART** on the Node.js application.

### 3. Monitoring the "Warming Up" Process
Because the server starts in the background, you must watch the logs to know when it is ready (Wait ~30-60s):
```bash
tail -f /home/vdranjxy/comrades-backend/stderr.log
```
**Wait for these lines:**
- `🚀 Server bound to port... REBOOT SUCCESSFUL` (First 1 second)
- `✅ Database connected and verified successfully`
- `✅ 35+ Route modules successfully lazy-loaded.`
- `✨ Server Middleware Finalized.` (**<- API is now working**)
- `[WhatsApp JS] EVENT: QR Code Generated!` (**<- Ready to scan**)

---

## ⚠️ Important Maintenance Notes

> [!IMPORTANT]
> **Database Schema Updates**: I have disabled automatic synchronization (`sequelize.sync`) in production to save boot time.
> If you add a new column to a model, the database will **NOT** update automatically. You must run:
> `export DB_SYNC=true && node /home/vdranjxy/comrades-backend/server.js` once manually, or use a migration script.

> [!TIP]
> **WhatsApp Session Recovery**: If WhatsApp stops sending messages, run:
> `rm -rf /home/vdranjxy/comrades-backend/.wwebjs_auth/baileys_session`
> Then restart the app. This forces a fresh QR code and fixes "Bad MAC" errors.

---

**Comrades360 is now stabilized and optimized for its environment.** 🥇
