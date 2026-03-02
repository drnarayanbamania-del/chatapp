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

        // Emit via Socket.io
        const io = req.app.get('socketio');
        if (io) {
            io.to(`user_${receiver_id}`).emit('new_message', newMessage);
        }

        res.status(201).json(newMessage);
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ message: 'Error sending message' });
    }
};

exports.deleteMessage = (req, res) => {
    const { id } = req.params;
    const userId = req.userId;

    try {
        const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
        if (!msg) return res.status(404).json({ message: 'Message not found' });
        if (msg.sender_id !== userId) return res.status(403).json({ message: 'Unauthorized' });

        db.prepare('UPDATE messages SET is_deleted = 1, message = "This message was deleted" WHERE id = ?').run(id);

        // Notify receiver
        const io = req.app.get('socketio');
        if (io) {
            io.to(`user_${msg.receiver_id}`).emit('message_deleted', { id });
        }

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting message' });
    }
};

exports.markAsRead = (req, res) => {
    const { otherUserId } = req.params;
    const userId = req.userId;

    try {
        db.prepare('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0').run(otherUserId, userId);

        // Notify sender that their messages were read
        const io = req.app.get('socketio');
        if (io) {
            io.to(`user_${otherUserId}`).emit('messages_read', { readerId: userId });
        }

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ message: 'Error marking messages as read' });
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
                 ORDER BY created_at DESC LIMIT 1) as last_message_time,
                (SELECT COUNT(*) FROM messages 
                 WHERE sender_id = u.id AND receiver_id = ? AND is_read = 0) as unread_count
            FROM users u
            WHERE u.id IN (
                SELECT DISTINCT sender_id FROM messages WHERE receiver_id = ?
                UNION
                SELECT DISTINCT receiver_id FROM messages WHERE sender_id = ?
            )
        `).all(userId, userId, userId, userId, userId, userId, userId);

        res.status(200).json(chatList);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching chat list' });
    }
};

exports.toggleFavourite = (req, res) => {
    const { id } = req.params;
    const userId = req.userId;

    try {
        const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
        if (!msg) return res.status(404).json({ message: 'Message not found' });

        const newStatus = msg.is_favourite ? 0 : 1;
        db.prepare('UPDATE messages SET is_favourite = ? WHERE id = ?').run(newStatus, id);

        // Notify client
        const io = req.app.get('socketio');
        if (io) {
            io.to(`user_${userId}`).emit('message_favourited', { id, is_favourite: newStatus });
            // Optionally, we don't need to notify the other user about favourites, usually it's local to the user.
        }

        res.status(200).json({ success: true, is_favourite: newStatus });
    } catch (error) {
        res.status(500).json({ message: 'Error toggling favourite' });
    }
};
