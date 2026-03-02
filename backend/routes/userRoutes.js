const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

router.use(authMiddleware);

router.get('/search', userController.searchUsers);
router.get('/profile', userController.getProfile);
router.post('/profile-photo', upload.single('photo'), userController.uploadProfilePhoto);
router.get('/all', userController.getAllUsers);

router.post('/lock-chat', userController.lockChat);
router.post('/unlock-chat', userController.unlockChat);
router.post('/verify-lock', userController.verifyLock);
router.get('/locked-chats', userController.getLockedChats);

module.exports = router;
