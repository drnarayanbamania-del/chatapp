const db = require('../models/db');

exports.searchUsers = (req, res) => {
    const { query } = req.query;
    const currentUserId = req.userId;

    if (!query) {
        return res.status(400).json({ message: 'Search query is required' });
    }

    try {
        const users = db.prepare(`
            SELECT 
                u.id, 
                u.name, 
                u.username, 
                u.phone, 
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
            WHERE (u.name LIKE ? OR u.username LIKE ? OR u.phone LIKE ?) 
            AND u.id != ?
            ORDER BY last_message_time IS NULL, last_message_time DESC, u.name ASC
        `).all(
            currentUserId, currentUserId, currentUserId, currentUserId, currentUserId,
            `%${query}%`, `%${query}%`, `%${query}%`, currentUserId
        );

        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error searching users' });
    }
};

exports.getProfile = (req, res) => {
    const userId = req.userId;

    try {
        const user = db.prepare('SELECT id, name, username, email, phone, profile_photo, created_at FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching profile' });
    }
};

exports.getAllUsers = (req, res) => {
    const currentUserId = req.userId;

    try {
        const users = db.prepare('SELECT id, name, username, phone, profile_photo FROM users WHERE id != ?').all(currentUserId);
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users' });
    }
};

exports.uploadProfilePhoto = (req, res) => {
    const userId = req.userId;
    const file = req.file;

    if (!file) {
        return res.status(400).json({ message: 'Please upload a photo' });
    }

    try {
        const photoPath = `/uploads/${file.filename}`;
        db.prepare('UPDATE users SET profile_photo = ? WHERE id = ?').run(photoPath, userId);
        res.status(200).json({ message: 'Profile photo updated', profile_photo: photoPath });
    } catch (error) {
        res.status(500).json({ message: 'Error updating profile photo' });
    }
};

exports.lockChat = (req, res) => {
    const userId = req.userId;
    const { locked_chat_id, passcode } = req.body;

    if (!locked_chat_id || !passcode) {
        return res.status(400).json({ message: 'Chat ID and Passcode are required' });
    }

    try {
        const existingLock = db.prepare('SELECT id FROM chat_locks WHERE user_id = ? AND locked_chat_id = ?').get(userId, locked_chat_id);
        if (existingLock) {
            return res.status(400).json({ message: 'Chat is already locked' });
        }
        db.prepare('INSERT INTO chat_locks (user_id, locked_chat_id, passcode) VALUES (?, ?, ?)').run(userId, locked_chat_id, passcode);
        res.status(200).json({ message: 'Chat locked successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error locking chat' });
    }
};

exports.unlockChat = (req, res) => {
    const userId = req.userId;
    const { locked_chat_id, passcode } = req.body;

    try {
        const lock = db.prepare('SELECT passcode FROM chat_locks WHERE user_id = ? AND locked_chat_id = ?').get(userId, locked_chat_id);
        if (!lock) return res.status(404).json({ message: 'Chat is not locked' });

        if (lock.passcode !== passcode) {
            return res.status(401).json({ message: 'Incorrect passcode' });
        }

        db.prepare('DELETE FROM chat_locks WHERE user_id = ? AND locked_chat_id = ?').run(userId, locked_chat_id);
        res.status(200).json({ message: 'Chat unlocked successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error unlocking chat' });
    }
};

exports.verifyLock = (req, res) => {
    const userId = req.userId;
    const { locked_chat_id, passcode } = req.body;

    try {
        const lock = db.prepare('SELECT passcode FROM chat_locks WHERE user_id = ? AND locked_chat_id = ?').get(userId, locked_chat_id);
        if (!lock) return res.status(200).json({ locked: false });

        if (passcode && lock.passcode === passcode) {
            return res.status(200).json({ locked: true, verified: true });
        } else {
            return res.status(200).json({ locked: true, verified: false });
        }
    } catch (error) {
        res.status(500).json({ message: 'Error verifying lock' });
    }
};

exports.getLockedChats = (req, res) => {
    const userId = req.userId;
    try {
        const locks = db.prepare('SELECT locked_chat_id FROM chat_locks WHERE user_id = ?').all(userId);
        res.status(200).json(locks.map(l => l.locked_chat_id));
    } catch (error) {
        res.status(500).json({ message: 'Error fetching locked chats' });
    }
};
