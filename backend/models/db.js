const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, '../../database/database.sqlite');

let db;
try {
    console.log(`Connecting to database at: ${dbPath}`);
    db = new Database(dbPath);
    console.log('Database connected successfully.');
} catch (err) {
    console.error('DATABASE CONNECTION FAILED:', err);
    process.exit(1); // Force exit to show crash logs in Hostinger
}

module.exports = db;
