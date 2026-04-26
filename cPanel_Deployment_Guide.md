# Comrades360 Production Deployment Guide

## Why the cPanel "Setup Node.js App" Restart Button Fails

It is a known limitation of how shared cPanel hosting manages Node.js applications. The hosting provider (Truehost CloudLinux) *technically* could tweak the settings, but they almost certainly won't because you are on a shared server and changing the global settings would affect all other customers on the same server.

Here is the real technical issue behind what was happening:

### The Real Issue: Passenger vs. Heavy Background Services
The cPanel "Node.js App" manager uses a system called **Phusion Passenger**. Passenger is designed for simple, lightweight web APIs. It works by "lazy-starting" your app — it waits until a user visits the website, then rapidly boots up your Node.js code, expects it to attach to a Unix Socket within ~3 seconds, and immediately serve the web page.

Your application is **much more complex** than a simple web API. When your `server.js` starts, it:
1. Boots up a heavy Socket.IO real-time server.
2. Initializes the database connection pools.
3. Fires up the **WhatsApp Engine (Baileys)** which is extremely resource-heavy and initiates multiple background network requests to load sessions.

**What goes wrong:**
When cPanel/Passenger tries to restart your app, it sees all these heavy background tasks starting up and it **panics**. Passenger has a strict startup timeout. Because the WhatsApp engine and Socket.IO take time to initialize, Passenger assumes your app "froze" or "hung", so it refuses to route traffic to it, kills the socket, and throws that `Can't acquire lock` error when you try to click the button again.

### Why our PM2 solution is actually better
What we just set up (using **PM2**) is exactly how enterprise Node.js applications are deployed on Dedicated Servers and VPS environments. 

Instead of Passenger starting and stopping your app on every request, **PM2 keeps your app running permanently in the background.** It handles the heavy WhatsApp engine beautifully, keeps your Socket.IO connections alive without dropping them, and restarts the app instantly if it ever crashes. Apache just acts as a simple traffic cop, forwarding the requests.

You now have a true "VPS-style" production setup running inside a shared cPanel environment!

---

## How to Restart the App in the Future

Because we bypassed the cPanel App Manager, **you no longer need to click the "Restart" button in the cPanel interface.**

Whenever you push new code to GitHub and deploy it to the server, simply follow these steps to restart the application:

1. Open the **cPanel Terminal**.
2. Run the following commands:

```bash
# Navigate to the live application directory
cd ~/comrades-master

# Restart the application using PM2
./node_modules/.bin/pm2 restart comrades360
```

### Helpful PM2 Commands to Remember:
If you ever need to check the health or logs of the application, use these commands from inside `~/comrades-master`:

- **Check App Status:**
  `./node_modules/.bin/pm2 status`

- **View Live Application Logs:**
  `./node_modules/.bin/pm2 logs comrades360`

- **Stop the Application:**
  `./node_modules/.bin/pm2 stop comrades360`
