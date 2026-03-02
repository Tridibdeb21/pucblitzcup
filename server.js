const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const RESULTS_FILE = path.join(__dirname, 'results.json');

// Store rooms in memory
const rooms = new Map();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Initialize results file
async function initResultsFile() {
    try {
        await fs.access(RESULTS_FILE);
    } catch {
        await fs.writeFile(RESULTS_FILE, JSON.stringify([]));
    }
}

// Generate random room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Generate random password
function generatePassword() {
    return Math.random().toString(36).substring(2, 10);
}

// Broadcast active rooms
function broadcastActiveRooms() {
    const activeRooms = Array.from(rooms.values()).map(room => ({
        id: room.id,
        name: room.name,
        players: room.players.filter(p => p !== null).length,
        duration: room.duration,
        interval: room.interval,
        problems: room.problems.length
    }));
    
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'ACTIVE_ROOMS',
                rooms: activeRooms
            }));
        }
    });
}

// WebSocket connection
wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            switch(data.type) {
                case 'CREATE_ROOM':
                    handleCreateRoom(ws, data);
                    break;
                    
                case 'JOIN_ROOM':
                    handleJoinRoom(ws, data);
                    break;
                    
                case 'REJOIN_ROOM':
                    handleRejoinRoom(ws, data);
                    break;
                    
                case 'LEAVE_ROOM':
                    handleLeaveRoom(ws, data);
                    break;
                    
                case 'START_BATTLE':
                    handleStartBattle(ws, data);
                    break;
                    
                case 'GET_ACTIVE_ROOMS':
                    sendActiveRooms(ws);
                    break;
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });
    
    ws.on('close', () => {
        for (const [roomId, room] of rooms.entries()) {
            const playerIndex = room.players.indexOf(ws);
            if (playerIndex !== -1) {
                room.players[playerIndex] = null;
                broadcastActiveRooms();
                break;
            }
        }
    });
});

function handleCreateRoom(ws, data) {
    const roomId = generateRoomId();
    const password = generatePassword();
    const roomName = data.roomName || `Room ${roomId}`;
    
    const room = {
        id: roomId,
        name: roomName,
        password: password,
        players: [ws, null],
        handles: [data.handle, null],
        host: data.handle,
        duration: data.duration,
        interval: data.interval,
        problems: data.problems,
        battleState: null,
        createdAt: Date.now()
    };
    
    rooms.set(roomId, room);
    
    ws.send(JSON.stringify({
        type: 'ROOM_CREATED',
        roomId: roomId,
        password: password,
        roomName: roomName,
        duration: data.duration,
        interval: data.interval,
        problems: data.problems
    }));
    
    broadcastActiveRooms();
}

function handleJoinRoom(ws, data) {
    const room = rooms.get(data.roomId);
    
    if (!room) {
        ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            message: 'Room not found'
        }));
        return;
    }
    
    if (room.password !== data.password) {
        ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            message: 'Incorrect password'
        }));
        return;
    }
    
    const existingIndex = room.handles.indexOf(data.handle);
    if (existingIndex !== -1 && room.handles[existingIndex] === data.handle) {
        room.players[existingIndex] = ws;
        
        ws.send(JSON.stringify({
            type: 'REJOIN_SUCCESS',
            roomId: room.id,
            roomData: {
                name: room.name,
                duration: room.duration,
                interval: room.interval,
                problems: room.problems
            },
            players: room.handles.filter(h => h !== null),
            isHost: room.host === data.handle,
            battleState: room.battleState
        }));
        
        const otherPlayerIndex = existingIndex === 0 ? 1 : 0;
        if (room.players[otherPlayerIndex]) {
            room.players[otherPlayerIndex].send(JSON.stringify({
                type: 'PLAYER_RECONNECTED',
                handle: data.handle,
                players: room.handles.filter(h => h !== null)
            }));
        }
        
        broadcastActiveRooms();
        return;
    }
    
    const emptySlot = room.players.indexOf(null);
    if (emptySlot === -1) {
        ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            message: 'Room is full'
        }));
        return;
    }
    
    room.players[emptySlot] = ws;
    room.handles[emptySlot] = data.handle;
    
    room.players.forEach((player, index) => {
        if (player) {
            player.send(JSON.stringify({
                type: 'ROOM_JOINED',
                roomId: room.id,
                roomName: room.name,
                playerIndex: index,
                players: room.handles.filter(h => h !== null),
                isHost: room.host === room.handles[index],
                duration: room.duration,
                interval: room.interval,
                problems: room.problems
            }));
        }
    });
    
    broadcastActiveRooms();
}

function handleRejoinRoom(ws, data) {
    const room = rooms.get(data.roomId);
    
    if (!room) {
        ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            message: 'Room not found'
        }));
        return;
    }
    
    const playerIndex = room.handles.indexOf(data.handle);
    if (playerIndex === -1) {
        ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            message: 'Player not found in room'
        }));
        return;
    }
    
    room.players[playerIndex] = ws;
    
    ws.send(JSON.stringify({
        type: 'REJOIN_SUCCESS',
        roomId: room.id,
        roomData: {
            name: room.name,
            duration: room.duration,
            interval: room.interval,
            problems: room.problems
        },
        players: room.handles.filter(h => h !== null),
        isHost: room.host === data.handle,
        battleState: room.battleState
    }));
    
    const otherPlayerIndex = playerIndex === 0 ? 1 : 0;
    if (room.players[otherPlayerIndex]) {
        room.players[otherPlayerIndex].send(JSON.stringify({
            type: 'PLAYER_RECONNECTED',
            handle: data.handle,
            players: room.handles.filter(h => h !== null)
        }));
    }
    
    broadcastActiveRooms();
}

function handleLeaveRoom(ws, data) {
    const room = rooms.get(data.roomId);
    if (!room) return;
    
    const playerIndex = room.players.indexOf(ws);
    if (playerIndex !== -1) {
        const leftHandle = room.handles[playerIndex];
        room.players[playerIndex] = null;
        room.handles[playerIndex] = null;
        
        if (leftHandle === room.host && room.handles.some(h => h !== null && h !== leftHandle)) {
            const newHostIndex = room.handles.findIndex(h => h !== null && h !== leftHandle);
            room.host = room.handles[newHostIndex];
        }
        
        const otherPlayer = room.players.find(p => p !== null);
        if (otherPlayer) {
            otherPlayer.send(JSON.stringify({
                type: 'PLAYER_LEFT',
                handle: leftHandle,
                players: room.handles.filter(h => h !== null)
            }));
        }
        
        if (room.players.every(p => p === null)) {
            rooms.delete(data.roomId);
        }
        
        broadcastActiveRooms();
    }
}

function handleStartBattle(ws, data) {
    const room = rooms.get(data.roomId);
    if (!room) return;
    
    room.battleState = data.battleState;
    
    room.players.forEach(player => {
        if (player && player !== ws) {
            player.send(JSON.stringify({
                type: 'BATTLE_STARTED',
                battleState: data.battleState
            }));
        }
    });
}

function sendActiveRooms(ws) {
    const activeRooms = Array.from(rooms.values()).map(room => ({
        id: room.id,
        name: room.name,
        players: room.players.filter(p => p !== null).length,
        duration: room.duration,
        interval: room.interval,
        problems: room.problems.length
    }));
    
    ws.send(JSON.stringify({
        type: 'ACTIVE_ROOMS',
        rooms: activeRooms
    }));
}

// API Routes
app.get('/api/results', async (req, res) => {
    try {
        const data = await fs.readFile(RESULTS_FILE, 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/results', async (req, res) => {
    try {
        const results = JSON.parse(await fs.readFile(RESULTS_FILE, 'utf8'));
        results.push(req.body);
        await fs.writeFile(RESULTS_FILE, JSON.stringify(results, null, 2));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/results', async (req, res) => {
    try {
        await fs.writeFile(RESULTS_FILE, JSON.stringify([]));
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

initResultsFile().then(() => {
    server.listen(PORT, () => {
        console.log(`Server running on https://blitzing-2.onrender.com`);
    });
});
