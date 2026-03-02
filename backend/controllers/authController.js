const jwt = require('jsonwebtoken');
const db = require('../models/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// In-memory store for OTPs (For production, use a DB table or Redis)
const otpStore = new Map();

exports.sendOTP = async (req, res) => {
    const { phone } = req.body;

    if (!phone) {
        return res.status(400).json({ message: 'Phone number is required' });
    }

    // Generate a random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Save for 5 minutes
    const expires = Date.now() + 5 * 60 * 1000;
    otpStore.set(phone, { otp, expires });

    console.log(`--- SIMULATED SMS ---`);
    console.log(`To: ${phone}`);
    console.log(`OTP: ${otp}`);
    console.log(`---------------------`);

    res.status(200).json({
        message: 'OTP sent successfully (Simulated)',
        debug_otp: otp // Returning OTP for easy testing
    });
};

exports.verifyOTP = async (req, res) => {
    const { phone, otp, name, username } = req.body;

    if (!phone || !otp) {
        return res.status(400).json({ message: 'Phone and OTP are required' });
    }

    const record = otpStore.get(phone);

    if (!record) {
        return res.status(400).json({ message: 'No OTP requested for this number' });
    }

    if (Date.now() > record.expires) {
        otpStore.delete(phone);
        return res.status(400).json({ message: 'OTP expired' });
    }

    if (record.otp !== otp) {
        return res.status(400).json({ message: 'Invalid OTP' });
    }

    try {
        // Check if user exists
        let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);

        if (!user) {
            // New user registration flow
            if (!name || !username) {
                // If name/username not provided, signal frontend to show profile step
                return res.status(200).json({ status: 'needs_profile', message: 'OTP verified' });
            }

            // Create new user
            const insertStmt = db.prepare('INSERT INTO users (name, username, phone) VALUES (?, ?, ?)');
            const info = insertStmt.run(name, username, phone);
            user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
        }

        // Cleanup used OTP
        otpStore.delete(phone);

        // Generate JWT
        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

        res.status(200).json({
            token,
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                phone: user.phone
            }
        });

    } catch (error) {
        console.error('Verify OTP error:', error);
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ message: 'Username already taken' });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.login = async (req, res) => {
    res.status(405).json({ message: 'Please use Phone-based login' });
};
