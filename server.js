/**
 * server.js — Express + Socket.io entry point
 * Serves static frontend from /public and handles
 * real-time WebSocket events for Snakes & Ladders multiplayer.
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const RoomManager = require('./server/room-manager');
const { registerSocketHandlers } = require('./server/socket-handlers');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 30000,
  pingInterval: 10000,
});

// Serve all static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Fallback: serve index.html for the root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize room manager (in-memory)
const roomManager = new RoomManager();

// Socket.io connection handler
io.on('connection', (socket) => {
  registerSocketHandlers(io, socket, roomManager);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎲 Game Hub running on http://localhost:${PORT}`);
});
