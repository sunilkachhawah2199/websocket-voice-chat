// ------------------------------  multi user in 1 room --------------------------------------
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createRoom, joinRoom, broadcastToRoom, leaveRoom } from './roomManager';
import { v4 as uuidv4 } from 'uuid';
import url from 'url';

// Create Express app and HTTP server
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Allow JSON body
app.use(express.json());

// Serve static files
app.use(express.static('.'));

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: '.' });
});

// POST /create-room
// Body: { "user_id": "user123" }
app.post('/create-room', (req, res) => {
    const userId = req.body.user_id;
    if (!userId) return res.status(400).send({ error: 'Missing user_id' });

    const roomId = uuidv4();
    createRoom(roomId);

    res.send({ message: 'Room created', room_id: roomId });
});

// POST /join-room
// Body: { "room_id": "abc123" }
app.post('/join-room', (req, res) => {
    const roomId = req.body.room_id;
    if (!roomId) return res.status(400).send({ error: 'Missing room_id' });

    res.send({ message: 'Now connect via WebSocket to /?room_id=' + roomId });
});

// GET /rooms - List all active rooms
app.get('/rooms', (req, res) => {
    const { getAllRooms } = require('./roomManager');
    const rooms = getAllRooms();
    res.json({ rooms });
});

// GET /room/:id - Get room info
app.get('/room/:id', (req, res) => {
    const { getRoomInfo } = require('./roomManager');
    const roomInfo = getRoomInfo(req.params.id);
    if (roomInfo) {
        res.json(roomInfo);
    } else {
        res.status(404).json({ error: 'Room not found' });
    }
});

// Handle WebSocket connections
wss.on('connection', (ws: WebSocket, req) => {
    const { room_id } = url.parse(req.url!, true).query;
    const roomId = room_id as string;

    if (!roomId || !joinRoom(roomId, ws)) {
        ws.send('❌ Invalid room ID');
        ws.close();
        return;
    }

    ws.send(`✅ Joined room: ${roomId}`);

    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
        const message = data.toString();
        console.log(`📨 Message received: ${message}`);
        broadcastToRoom(roomId, message, ws); // Send to all others in same room
    });

    // Clean up on disconnect
    ws.on('close', () => {
        leaveRoom(roomId, ws);
    });
});

// Start server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server started at http://localhost:${PORT}`);
});