// -------------------------------------------------- user 1 to 1 chat -------------

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import url from 'url';

// Create Express app and HTTP server
const app = express();
const server = createServer(app);

// Create WebSocket server on top of HTTP
const wss = new WebSocketServer({ server });

// Map to store user_id -> WebSocket
const userSockets: Map<string, WebSocket> = new Map();

// Handle WebSocket connections
wss.on('connection', (ws: WebSocket, req) => {
    // Parse user_id from the query string
    const { user_id } = url.parse(req.url!, true).query;
    const userId = user_id as string;

    if (!userId) {
        ws.send('❌ Missing user_id');
        ws.close();
        return;
    }

    // Save the user's socket
    userSockets.set(userId, ws);
    console.log(`✅ User ${userId} connected`);

    ws.send(`👋 Hello ${userId}, you are connected`);

    // Handle incoming messages from this user
    ws.on('message', (msg: string) => {
        try {
            const data = JSON.parse(msg);
            const targetId = data.to;
            const messageText = data.message;

            const targetSocket = userSockets.get(targetId);
            if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
                targetSocket.send(`📩 Message from ${userId}: ${messageText}`);
            } else {
                ws.send(`❌ User ${targetId} is not online`);
            }
        } catch (err) {
            ws.send('❌ Invalid message format');
        }
    });

    // Remove user on disconnect
    ws.on('close', () => {
        userSockets.delete(userId);
        console.log(`❌ User ${userId} disconnected`);
    });
});

// Start server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});