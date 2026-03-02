const Database = require('better-sqlite3');
const db = new Database('database/database.sqlite');

try {
    db.exec(`
        ALTER TABLE messages ADD COLUMN is_read INTEGER DEFAULT 0;
        ALTER TABLE messages ADD COLUMN is_deleted INTEGER DEFAULT 0;
    `);
    console.log('Database updated successfully.');
} catch (err) {
    if (err.message.includes('duplicate column name')) {
        console.log('Columns already exist.');
    } else {
        console.error('Error updating database:', err);
    }
}
process.exit(0);
