# ChatApp Deployment Guide

This application is ready for deployment on Hostinger or any Node.js hosting platform.

## Prerequisites
- Node.js v18 or higher.
- NPM.

## Hostinger Deployment Tips

### 🚩 Resolving "Unsupported Framework" Error
If Hostinger says the framework is unsupported, ensure you follow these settings in your **hPanel > Node.js Dashboard**:
1.  **Framework Selection**: Set this to **"Custom"** or **"None"**. 
2.  **Entry Point**: Ensure this is set to **`server.js`**.
3.  **Scripts**: Most Hostinger Node installs expect a `start` script. Ensure `npm start` is allowed without sudo or other flags.

### 🚀 Deployment Steps
1. **Extract** the ZIP into your Hostinger webroot (e.g., `/home/username/public_html/chatapp`).
2. **Setup Node.js**: Select Node.js version **18.0.0 or higher** in the hPanel.
3. **Install Dependencies**: Click the **"Install"** button in the dashboard or run:
   ```bash
   npm install
   ```
4. **Initialize Database**:
   ```bash
   node database/init.js
   ```
5. **Start App**: Set the startup script to `npm start` or just the `server.js` file depending on your plan.

## Scripts
- `npm start`: Runs the production server.
- `npm run build`: Placeholder for deployment pipelines.

## Troubleshooting
If `better-sqlite3` fails to install, ensure your hosting environment has C++ build tools installed. If not, you may need to switch the database driver to `sqlite3`.
