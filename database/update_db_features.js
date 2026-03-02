const Database = require('better-sqlite3');
const db = new Database('database/database.sqlite');

try {
    db.exec(`
        ALTER TABLE users ADD COLUMN profile_photo TEXT;
    `);
    console.log('Added profile_photo to users.');
} catch (err) {
    if (!err.message.includes('duplicate column name')) console.error(err);
}

try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS chat_locks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            locked_chat_id INTEGER NOT NULL,
            passcode TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (locked_chat_id) REFERENCES users(id),
            UNIQUE(user_id, locked_chat_id)
        );
    `);
    console.log('Created chat_locks table.');
} catch (err) {
    console.error(err);
}

process.exit(0);
