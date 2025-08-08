import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import twilio from "twilio";
import dotenv from 'dotenv';
import { twiml } from 'twilio';
import axios from 'axios';


// Create Express app and HTTP server
dotenv.config();
const app = express();

// Middleware to parse JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

    const voiceResponse = new twiml.VoiceResponse();
    const start = voiceResponse.start();
    start.stream({
        name: 'Example Audio Stream',
        url: `wss://ox-together-leech.ngrok-free.app/media`,
    });
    voiceResponse.say('The stream has started.');
    voiceResponse.pause({ length: 3600 });

    console.log(voiceResponse.toString());

    const call = await client.calls.create({
        from: TWILIO_NUMBER,
        to: number,
        twiml: voiceResponse.toString(),
        record: true,                    // <- tells Twilio to capture the whole call
        recordingChannels: 'dual',       // optional: separate caller/agent tracks
        recordingStatusCallback: 'https://ox-together-leech.ngrok-free.app/record',
        recordingStatusCallbackEvent: ['completed']
    });

    return res.status(200).json({
        call
    })
})

app.all("/record", async (req: Request, res: Response) => {
    console.log('📞 Recording callback received');
    console.log('📋 Request method:', req.method);
    console.log('📋 Request body:', req.body);
    console.log('📋 Request query:', req.query);
    console.log('📋 Request headers:', req.headers);

    // Twilio sends data in req.body for POST requests
    const recordingData = req.body || req.query;

    const {
        RecordingSid,
        RecordingUrl,
        RecordingDuration,
        CallSid,
        RecordingStatus,
        RecordingSource,
        RecordingTrack
    } = recordingData;

    console.log('📊 Extracted recording data:', {
        RecordingSid,
        RecordingUrl,
        RecordingDuration,
        CallSid,
        RecordingStatus,
        RecordingSource,
        RecordingTrack
    });

    if (RecordingStatus === 'completed') {
        console.log(`✅ Recording completed: ${RecordingSid}`);
        console.log(`📁 Recording URL: ${RecordingUrl}`);
        console.log(`⏱️  Duration: ${RecordingDuration} seconds`);
        console.log(`📞 Call SID: ${CallSid}`);
        console.log(`🎵 Track: ${RecordingTrack || 'mixed'}`);

        // Download link for this recording
        const downloadUrl = `https://ox-together-leech.ngrok-free.app/download/${RecordingSid}`;
        console.log(`⬇️  Download URL: ${downloadUrl}`);

        // You can download the recording here if needed
        // const recording = await client.recordings(RecordingSid).fetch();
        // console.log('Recording details:', recording);
    }

    // Return TwiML response (Twilio expects this)
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
});

// Route to get recording details
app.get("/recording/:sid", async (req: Request, res: Response) => {
    try {
        const { sid } = req.params;
        if (!sid) {
            return res.status(400).json({ error: 'Recording SID is required' });
        }
        const recording = await client.recordings(sid).fetch();
        res.json(recording);
    } catch (error) {
        console.error('Error fetching recording:', error);
        res.status(500).json({ error: 'Failed to fetch recording' });
    }
});

// Route to list all recordings
app.get("/recordings", async (req: Request, res: Response) => {
    try {
        const recordings = await client.recordings.list({ limit: 20 });
        res.json(recordings);
    } catch (error) {
        console.error('Error fetching recordings:', error);
        res.status(500).json({ error: 'Failed to fetch recordings' });
    }
});

// Route to download a recording
app.get("/download/:sid", async (req: Request, res: Response) => {
    try {
        const { sid } = req.params;
        if (!sid) {
            return res.status(400).json({ error: 'Recording SID is required' });
        }

        // Get recording details
        const recording = await client.recordings(sid).fetch();
        console.log(`📥 Downloading recording: ${sid}`);

        // Fetch the actual audio file using Twilio client
        const mediaStream = await client.recordings(sid).fetch();

        // Get the media URL with proper authentication
        const mediaUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Recordings/${sid}.mp3`;

        // Use axios to fetch the file with authentication
        const response = await axios({
            method: 'GET',
            url: mediaUrl,
            auth: {
                username: TWILIO_ACCOUNT_SID,
                password: TWILIO_AUTH_TOKEN
            },
            responseType: 'stream'
        });

        // Set headers for file download
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="recording-${sid}.mp3"`);

        // Pipe the audio stream to response
        response.data.pipe(res);

    } catch (error) {
        console.error('Error downloading recording:', error);
        res.status(500).json({ error: 'Failed to download recording' });
    }
});



// ---------- Process the incoming stream ----------
wss.on('connection', (ws: WebSocket) => {
    console.log('🔌 Twilio WebSocket connected!');
    let streamSid = '';
    let mediaCount = 0;

    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());

        switch (msg.event) {
            case 'start':
                streamSid = msg.streamSid;
                console.log(`▶️  Media stream started, call SID: ${streamSid}`);
                break;

            case 'media': {
                mediaCount++;
                const audioBuffer = Buffer.from(msg.media.payload, 'base64');

                // Log progress every 100 media packets
                if (mediaCount % 100 === 0) {
                    console.log(`📊 Stream ${streamSid}: Received ${mediaCount} media packets`);
                }

                // TODO: Process audioBuffer (send to AI, save to disk, etc.)
                break;
            }

            case 'stop':
                console.log(`⏹️  Stream ${streamSid} ended: reason=${msg.reason}`);
                console.log(`📊 Total media packets received: ${mediaCount}`);
                // Don't close the WebSocket - keep it open for potential reconnection
                break;
        }
    });

    ws.on('close', () => console.log('🔌 WebSocket closed'));
    ws.on('error', (error) => console.error('❌ WebSocket error:', error));
});

// Start server
server.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});