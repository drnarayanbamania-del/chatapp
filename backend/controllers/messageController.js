const db = require('../models/db');

exports.sendMessage = (req, res) => {
    const { receiver_id, message } = req.body;
    const sender_id = req.userId;
    const file = req.file;

    if (!receiver_id) {
        return res.status(400).json({ message: 'Receiver ID is required' });
    }

    if (!message && !file) {
        return res.status(400).json({ message: 'Message or file is required' });
    }

    try {
        const attachment_path = file ? `/uploads/${file.filename}` : null;
        const attachment_name = file ? file.originalname : null;
        const attachment_type = file ? file.mimetype : null;

        const stmt = db.prepare(`
            INSERT INTO messages (sender_id, receiver_id, message, attachment_path, attachment_name, attachment_type) 
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(sender_id, receiver_id, message || '', attachment_path, attachment_name, attachment_type);

        const newMessage = db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid);
        res.status(201).json(newMessage);
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ message: 'Error sending message' });
    }
};

exports.getMessages = (req, res) => {
    const { otherUserId } = req.params;
    const currentUserId = req.userId;

    try {
        const messages = db.prepare(`
            SELECT * FROM messages 
            WHERE (sender_id = ? AND receiver_id = ?) 
            OR (sender_id = ? AND receiver_id = ?)
            ORDER BY created_at ASC
        `).all(currentUserId, otherUserId, otherUserId, currentUserId);

        res.status(200).json(messages);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching messages' });
    }
};

exports.getChatList = (req, res) => {
    const userId = req.userId;

    try {
        // Enhanced Chat List query to get the last message and its time
        const chatList = db.prepare(`
            SELECT 
                u.id, 
                u.name, 
                u.username,
                (SELECT message FROM messages 
                 WHERE (sender_id = ? AND receiver_id = u.id) 
                 OR (sender_id = u.id AND receiver_id = ?) 
                 ORDER BY created_at DESC LIMIT 1) as last_message,
                (SELECT created_at FROM messages 
                 WHERE (sender_id = ? AND receiver_id = u.id) 
                 OR (sender_id = u.id AND receiver_id = ?) 
                 ORDER BY created_at DESC LIMIT 1) as last_message_time
            FROM users u
            WHERE u.id IN (
                SELECT DISTINCT sender_id FROM messages WHERE receiver_id = ?
                UNION
                SELECT DISTINCT receiver_id FROM messages WHERE sender_id = ?
            )
        `).all(userId, userId, userId, userId, userId, userId);

        res.status(200).json(chatList);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching chat list' });
    }
};
