const db = require('better-sqlite3')('database/database.sqlite');

try {
    const userId = 1; // assuming user id 1
    const chatList = db.prepare(`
            SELECT 
                u.id, 
                u.name, 
                u.username,
                u.profile_photo,
                (SELECT message FROM messages 
                 WHERE (sender_id = ? AND receiver_id = u.id) 
                 OR (sender_id = u.id AND receiver_id = ?) 
                 ORDER BY created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM messages 
                 WHERE (sender_id = ? AND receiver_id = u.id) 
                 OR (sender_id = u.id AND receiver_id = ?) 
                 ORDER BY created_at DESC LIMIT 1) as last_message_time,
                (SELECT COUNT(*) FROM messages 
                 WHERE sender_id = u.id AND receiver_id = ? AND is_read = 0) as unread_count
            FROM users u
            WHERE u.id != ?
            ORDER BY last_message_time IS NULL, last_message_time DESC, u.name ASC
        `).all(userId, userId, userId, userId, userId, userId);

    console.log('Result:', chatList);
} catch (e) {
    console.error('Error:', e.message);
}
