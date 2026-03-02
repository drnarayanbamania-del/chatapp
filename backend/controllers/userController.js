const db = require('../models/db');

exports.searchUsers = (req, res) => {
    const { query } = req.query;
    const currentUserId = req.userId;

    if (!query) {
        return res.status(400).json({ message: 'Search query is required' });
    }

    try {
        const users = db.prepare(`
            SELECT id, name, username, phone 
            FROM users 
            WHERE (name LIKE ? OR username LIKE ? OR phone LIKE ?) 
            AND id != ?
        `).all(`%${query}%`, `%${query}%`, `%${query}%`, currentUserId);

        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error searching users' });
    }
};

exports.getProfile = (req, res) => {
    const userId = req.userId;

    try {
        const user = db.prepare('SELECT id, name, username, email, phone, created_at FROM users WHERE id = ?').get(userId);
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
        const users = db.prepare('SELECT id, name, username, phone FROM users WHERE id != ?').all(currentUserId);
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching users' });
    }
};
