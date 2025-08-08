import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import twilio from "twilio";
import dotenv from 'dotenv';

// Create Express app and HTTP server
dotenv.config();
const app = express();

// Middleware to parse JSON request bodies
app.use(express.json());

const server = createServer(app);
const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_NUMBER,
    PUBLIC_DOMAIN,
    PORT = 3000,
} = process.env;

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_NUMBER || !PUBLIC_DOMAIN) {
    throw new Error('Missing one or more required .env variables');
}

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// Create WebSocket server on top of HTTP
const wss = new WebSocketServer({ server });

app.post("/call", async (req: Request, res: Response) => {
    const { number } = req.body;
    const call = await client.calls.create({
        from: TWILIO_NUMBER,
        to: number,
        url: "http://demo.twilio.com/docs/voice.xml",
    });

    return res.status(200).json({
        sid: call.sid,
    })
})

// ---------- Process the incoming stream ----------
wss.on('connection', (ws: WebSocket) => {
    console.log('Twilio connected!');

    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());

        switch (msg.event) {
            case 'start':
                console.log(`▶️  Media stream started, call SID: ${msg.streamSid}`);
                break;

            case 'media': {
                // msg.media.payload is base64-encoded linear PCM 16-kHz mono
                const audioBuffer = Buffer.from(msg.media.payload, 'base64');
                // TODO: forward audioBuffer to your AI server, save to disk, etc.
                break;
            }

            case 'stop':
                console.log(`⏹️  Stream ended: reason=${msg.reason}`);
                ws.close();
                break;
        }
    });

    ws.on('close', () => console.log('WebSocket closed'));
});

// Start server
server.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});