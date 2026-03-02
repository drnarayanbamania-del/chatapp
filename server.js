require('dotenv').config();
console.log('--- Starting ChatApp Deployment ---');
console.log('Node Version:', process.version);
console.log('Platform:', process.platform);

const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./backend/routes/authRoutes');
const userRoutes = require('./backend/routes/userRoutes');
const messageRoutes = require('./backend/routes/messageRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health Check for Deployment Debugging
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', uptime: process.uptime(), timestamp: new Date() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

// Fallback for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server successfully started on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
});

// Graceful Error Handling for Deployment
process.on('uncaughtException', (err) => {
    console.error('CRITICAL ERROR: Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL ERROR: Unhandled Rejection at:', promise, 'reason:', reason);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Deployment may need a different port.`);
    } else {
        console.error('Server error:', err);
    }
});
