const Database = require('better-sqlite3');
const db = new Database('database/database.sqlite');

try {
    db.exec(`
        ALTER TABLE messages ADD COLUMN is_favourite INTEGER DEFAULT 0;
    `);
    console.log('Added is_favourite to messages.');
} catch (err) {
    if (!err.message.includes('duplicate column name')) console.error(err);
}

process.exit(0);
