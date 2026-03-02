const Database = require('better-sqlite3');
const db = new Database('database/database.sqlite');

try {
    db.exec(`
        ALTER TABLE messages ADD COLUMN deleted_by_sender INTEGER DEFAULT 0;
        ALTER TABLE messages ADD COLUMN deleted_by_receiver INTEGER DEFAULT 0;
    `);
    console.log('Database updated successfully with delete logic.');
} catch (err) {
    if (err.message.includes('duplicate column name')) {
        console.log('Columns already exist.');
    } else {
        console.error('Error updating database:', err);
    }
}
process.exit(0);
