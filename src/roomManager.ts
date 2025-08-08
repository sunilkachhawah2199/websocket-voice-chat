import { WebSocket } from 'ws';

interface Room {
    id: string;
    connections: Set<WebSocket>;
}

const rooms = new Map<string, Room>();

export function createRoom(roomId: string): void {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            id: roomId,
            connections: new Set()
        });
        console.log(`🏠 Room created: ${roomId}`);
    }
}

export function joinRoom(roomId: string, ws: WebSocket): boolean {
    let room = rooms.get(roomId);
    if (!room) {
        // Auto-create room if it doesn't exist
        createRoom(roomId);
        room = rooms.get(roomId);
    }

    if (room) {
        room.connections.add(ws);
        console.log(`👤 User joined room: ${roomId} (${room.connections.size} users)`);
        return true;
    }

    console.log(`❌ Failed to join room: ${roomId}`);
    return false;
}

export function leaveRoom(roomId: string, ws: WebSocket): void {
    const room = rooms.get(roomId);
    if (room) {
        room.connections.delete(ws);
        console.log(`👋 User left room: ${roomId} (${room.connections.size} users remaining)`);

        // Clean up empty rooms
        if (room.connections.size === 0) {
            rooms.delete(roomId);
            console.log(`🗑️  Room deleted: ${roomId}`);
        }
    }
}

export function broadcastToRoom(roomId: string, message: string, sender?: WebSocket): void {
    const room = rooms.get(roomId);
    if (!room) {
        console.log(`❌ Room not found for broadcast: ${roomId}`);
        return;
    }

    console.log(`📢 Broadcasting message to room ${roomId}: "${message}"`);
    console.log(`👥 Total connections in room: ${room.connections.size}`);

    let sentCount = 0;
    room.connections.forEach((connection) => {
        if (connection !== sender && connection.readyState === WebSocket.OPEN) {
            try {
                connection.send(message);
                sentCount++;
                console.log(`✅ Message sent to connection ${sentCount}`);
            } catch (error) {
                console.error(`❌ Failed to send message to connection:`, error);
            }
        } else if (connection === sender) {
            console.log(`⏭️  Skipping sender connection`);
        } else if (connection.readyState !== WebSocket.OPEN) {
            console.log(`🔌 Skipping closed connection (state: ${connection.readyState})`);
        }
    });

    console.log(`📢 Successfully broadcasted to ${sentCount} users in room: ${roomId}`);
}

export function getRoomInfo(roomId: string): { id: string; userCount: number } | null {
    const room = rooms.get(roomId);
    if (!room) return null;

    return {
        id: room.id,
        userCount: room.connections.size
    };
}

export function getAllRooms(): Array<{ id: string; userCount: number }> {
    return Array.from(rooms.values()).map(room => ({
        id: room.id,
        userCount: room.connections.size
    }));
}
