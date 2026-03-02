const jwt = require('jsonwebtoken');
const db = require('../models/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Mock function for sending SMS (In real world, use Twilio, Firebase, etc.)
const sendSMS = (phone, otp) => {
    console.log(`[SIMULATED SMS] To: ${phone} | Message: Your ChatApp OTP is ${otp}. Valid for 5 minutes.`);
    return true;
};

exports.sendOTP = async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ message: 'Phone number is required' });
    }

    try {
        // Generate 6 digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

        // Store OTP in database
        const stmt = db.prepare('INSERT INTO otp_verifications (phone, otp, expires_at) VALUES (?, ?, ?)');
        stmt.run(phone, otp, expiresAt.toISOString());

        // Send OTP via mockup
        sendSMS(phone, otp);

        res.status(200).json({ message: 'OTP sent successfully', debug_otp: (process.env.NODE_ENV !== 'production' ? otp : null) });
    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({ message: 'Error sending OTP' });
    }
};

exports.verifyOTP = async (req, res) => {
    const { phone, otp, name, username } = req.body;

    if (!phone || !otp) {
        return res.status(400).json({ message: 'Phone and OTP are required' });
    }

    try {
        // Check OTP in DB
        const verification = db.prepare(`
            SELECT * FROM otp_verifications 
            WHERE phone = ? AND otp = ? 
            ORDER BY created_at DESC LIMIT 1
        `).get(phone, otp);

        if (!verification) {
            return res.status(401).json({ message: 'Invalid OTP' });
        }

        const expiresAt = new Date(verification.expires_at);
        if (expiresAt < new Date()) {
            return res.status(401).json({ message: 'OTP expired' });
        }

        // OTP is valid. Check if user exists.
        let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);

        if (!user) {
            // New user registration after OTP verification
            if (!name || !username) {
                return res.status(200).json({ status: 'needs_profile', message: 'OTP verified. Please complete your profile.' });
            }

            const insertStmt = db.prepare('INSERT INTO users (name, username, phone) VALUES (?, ?, ?)');
            const info = insertStmt.run(name, username, phone);
            user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
        }

        // User logged in
        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

        // Clean up OTPs for this phone
        db.prepare('DELETE FROM otp_verifications WHERE phone = ?').run(phone);

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
        res.status(500).json({ message: 'Error verifying OTP' });
    }
};

exports.login = async (req, res) => {
    // Legacy login, just redirect to sendOTP flow in frontend
    res.status(405).json({ message: 'Please use OTP-based login' });
};
