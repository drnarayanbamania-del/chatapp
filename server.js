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
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 5000;

// Socket.io Logic
const userSockets = new Map(); // userId -> socketId

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join', (userId) => {
        socket.join(`user_${userId}`);
        userSockets.set(userId, socket.id);
        console.log(`User ${userId} joined their room`);
        io.emit('user_online', userId);
    });

    socket.on('typing', ({ senderId, receiverId }) => {
        socket.to(`user_${receiverId}`).emit('typing', { senderId });
    });

    socket.on('stop_typing', ({ senderId, receiverId }) => {
        socket.to(`user_${receiverId}`).emit('stop_typing', { senderId });
    });

    socket.on('disconnect', () => {
        let disconnectedUserId = null;
        for (const [userId, socketId] of userSockets.entries()) {
            if (socketId === socket.id) {
                disconnectedUserId = userId;
                userSockets.delete(userId);
                break;
            }
        }
        if (disconnectedUserId) {
            io.emit('user_offline', disconnectedUserId);
        }
        console.log('User disconnected:', socket.id);
    });
});

// Make io accessible in routes
app.set('socketio', io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health Check for Deployment Debugging
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', uptime: process.uptime(), timestamp: new Date(), onlineUsers: userSockets.size });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);

// Fallback for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
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
