const path = require('path');
const fs = require('fs');

const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
    try {
        if (fs.existsSync(serviceAccountPath)) {
            const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log("✅ Firebase Admin initialized with serviceAccountKey.json");
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            admin.initializeApp({
                credential: admin.credential.applicationDefault()
            });
            console.log("✅ Firebase Admin initialized with Application Default Credentials");
        } else {
            console.warn("\n⚠️  Firebase Admin NOT initialized.");
            console.warn("   Missing serviceAccountKey.json in root or GOOGLE_APPLICATION_CREDENTIALS env var.");
            console.warn("   Login verification will fail in production.\n");
        }
    } catch (e) {
        console.error("❌ Firebase Admin Initialization Error:", e.message);
    }
}

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// This is no longer needed but kept for route compatibility
exports.sendOTP = async (req, res) => {
    res.status(200).json({ message: 'Firebase handles OTP sending on Client Side.' });
};

exports.verifyOTP = async (req, res) => {
    const { firebaseToken, name, username } = req.body;

    if (!firebaseToken) {
        return res.status(400).json({ message: 'Firebase Token is required' });
    }

    try {
        let decodedToken;
        try {
            if (admin.apps.length === 0) {
                throw new Error("Firebase Admin not initialized");
            }
            decodedToken = await admin.auth().verifyIdToken(firebaseToken);
        } catch (authError) {
            console.error("Firebase Verify Error:", authError.message);
            // Fallback for development if no admin setup OR testing
            if (process.env.NODE_ENV !== 'production' && (firebaseToken === 'debug-token' || !admin.apps.length)) {
                console.warn("⚠️ Using DEBUG fallback for authentication");
                decodedToken = { phone_number: '+1234567890' };
            } else {
                return res.status(401).json({ message: 'Authentication Service Unavailable or Invalid Token' });
            }
        }

        const phone = decodedToken.phone_number;
        if (!phone) return res.status(400).json({ message: 'Phone number not found in token' });

        // Check if user exists.
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

        // Successfully authenticated
        const jwtToken = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });

        res.status(200).json({
            token: jwtToken,
            user: {
                id: user.id,
                name: user.name,
                username: user.username,
                phone: user.phone
            }
        });

    } catch (error) {
        console.error('Verify OTP Sync error:', error);
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(400).json({ message: 'Username already taken' });
        }
        res.status(500).json({ message: 'Error syncing with authentication' });
    }
};

exports.login = async (req, res) => {
    res.status(405).json({ message: 'Please use Phone-based login' });
};
