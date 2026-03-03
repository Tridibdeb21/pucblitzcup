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
const ROOM_CLEANUP_DELAY_MS = 5 * 60 * 1000;
const ROOM_NO_OPPONENT_TIMEOUT_MS = 5 * 60 * 1000;
const MATCH_START_COUNTDOWN_MS = 15 * 1000;

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

function ensureSequentialBlitzNumbers(results = []) {
    if (!Array.isArray(results)) return { normalized: [], changed: false };

    const cloned = results.map(item => ({ ...item }));
    const sorted = [...cloned].sort((a, b) => {
        const aTime = new Date(a.date || 0).getTime();
        const bTime = new Date(b.date || 0).getTime();
        return aTime - bTime;
    });

    let changed = false;
    sorted.forEach((item, index) => {
        const nextNumber = index + 1;
        if (Number(item.blitzNumber) !== nextNumber) {
            changed = true;
            item.blitzNumber = nextNumber;
        }
    });

    const byMatchKey = new Map(sorted.map(item => [item.matchKey || `${item.roomId}-${item.date}-${Math.random()}`, item]));
    const normalized = cloned.map(item => {
        const key = item.matchKey || `${item.roomId}-${item.date}-${Math.random()}`;
        return byMatchKey.get(key) || item;
    });

    return { normalized, changed };
}

// Generate random room ID
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function roomNameTaken(name) {
    const normalized = (name || '').trim().toLowerCase();
    if (!normalized) return false;
    return Array.from(rooms.values()).some(room => room.name.toLowerCase() === normalized);
}

function getConnectedPlayersCount(room) {
    return room.players.filter(player => !!player.ws).length;
}

function getAssignedPlayersCount(room) {
    return room.players.filter(player => !!player.handle).length;
}

function isBattleRunning(room) {
    if (!room.battleState) return false;
    return room.battleState.status === 'running' && Date.now() < room.battleState.endsAt;
}

function isBattleEnded(room) {
    if (!room.battleState) return false;
    return room.battleState.status === 'ended' || Date.now() >= room.battleState.endsAt;
}

function isRoomExpired(room) {
    if (!room.battleState || !room.battleState.cleanupAt) return false;
    return Date.now() >= room.battleState.cleanupAt;
}

function sendToRoom(room, message) {
    room.players.forEach(player => {
        if (player.ws && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify(message));
        }
    });
}

function getFirstTwoConnectedHandles(room) {
    const handles = room.players
        .filter(player => player.handle && player.ws && player.ws.readyState === WebSocket.OPEN)
        .map(player => player.handle);
    if (handles.length < 2) return null;
    return [handles[0], handles[1]];
}

function getAutoStartPair(room) {
    const handles = room.players
        .filter(player => player.handle && player.ws && player.ws.readyState === WebSocket.OPEN)
        .map(player => player.handle);

    if (room.opponentHandle) {
        if (!handles.includes(room.host)) {
            return { pair: null, waitMessage: 'Waiting for host to be connected.' };
        }
        if (!handles.includes(room.opponentHandle)) {
            return { pair: null, waitMessage: `Waiting for selected opponent ${room.opponentHandle} to join room.` };
        }
        return { pair: [room.host, room.opponentHandle], waitMessage: '' };
    }

    if (handles.length < 2) {
        return { pair: null, waitMessage: 'Waiting for match creator and opponent to be connected.' };
    }

    return { pair: [handles[0], handles[1]], waitMessage: '' };
}

function broadcastValidationStatus(room, payload) {
    sendToRoom(room, {
        type: 'VALIDATION_STATUS',
        roomId: room.id,
        ...payload
    });
}

function finalizeBattle(room, reason = 'timer') {
    if (!room || !room.battleState) return;
    if (room.battleState.status === 'ended') return;

    const now = Date.now();
    room.battleState.status = 'ended';
    room.battleState.endedAt = now;
    room.battleState.endReason = reason;
    room.battleState.endsAt = now;
    room.battleState.cleanupAt = now + ROOM_CLEANUP_DELAY_MS;

    if (room.endTimeout) {
        clearTimeout(room.endTimeout);
        room.endTimeout = null;
    }

    scheduleRoomCleanup(room);

    sendToRoom(room, {
        type: 'BATTLE_FINISHED',
        roomId: room.id,
        battleState: room.battleState
    });

    broadcastActiveRooms();
}

function getRoomPublicState(room) {
    return {
        id: room.id,
        name: room.name,
        opponentHandle: room.opponentHandle,
        duration: room.duration,
        interval: room.interval,
        problems: room.problems,
        validationProblem: room.validationProblem,
        countdownInProgress: !!room.countdownInProgress,
        countdownEndsAt: room.countdownEndsAt || null,
        players: room.players.filter(player => !!player.handle).map(player => player.handle),
        battleState: room.battleState
    };
}

function getConnectedHandles(room) {
    return room.players
        .filter(player => !!player.handle && !!player.ws && player.ws.readyState === WebSocket.OPEN)
        .map(player => player.handle);
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

async function validateHandle(handle) {
    const data = await fetchJson(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`);
    return data.status === 'OK';
}

async function hasCompilationErrorOnProblem(handle, validationProblem) {
    if (!validationProblem) return false;
    const data = await fetchJson(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=100`);
    if (data.status !== 'OK') return false;

    return data.result.some(sub => {
        if (!sub.problem) return false;
        return (
            sub.verdict === 'COMPILATION_ERROR' &&
            sub.problem.contestId === validationProblem.contestId &&
            sub.problem.index === validationProblem.index
        );
    });
}

async function generateValidationProblem() {
    const source = await fetchJson('https://codeforces.com/api/problemset.problems?tags=implementation');
    if (source.status !== 'OK') {
        throw new Error('Failed to fetch Codeforces problemset');
    }

    const all = source.result.problems.filter(p => p.contestId && p.index && p.rating);
    const pool = all.filter(p => p.rating >= 800 && p.rating <= 1500);
    if (pool.length === 0) {
        throw new Error('No validation problem available');
    }

    const chosen = pool[Math.floor(Math.random() * pool.length)];
    return {
        id: `${chosen.contestId}${chosen.index}`,
        contestId: chosen.contestId,
        index: chosen.index,
        name: chosen.name,
        rating: chosen.rating,
        url: `https://codeforces.com/problemset/problem/${chosen.contestId}/${chosen.index}`
    };
}

async function generateRoomProblems(configProblems = [], excludedIds = []) {
    const source = await fetchJson('https://codeforces.com/api/problemset.problems?tags=implementation');
    if (source.status !== 'OK') {
        throw new Error('Failed to fetch Codeforces problemset');
    }

    const all = source.result.problems.filter(p => p.contestId && p.index && p.rating);
    const usedIds = new Set(excludedIds || []);
    const selected = [];

    for (const cfg of configProblems) {
        const targetRating = cfg.rating || 1200;
        const candidates = all.filter(p => !usedIds.has(`${p.contestId}${p.index}`) && Math.abs(p.rating - targetRating) <= 100);
        const fallback = all.filter(p => !usedIds.has(`${p.contestId}${p.index}`) && p.rating >= 800 && p.rating <= 2000);
        const pool = candidates.length > 0 ? candidates : fallback;
        if (pool.length === 0) {
            throw new Error('No problems available to generate battle set');
        }

        const chosen = pool[Math.floor(Math.random() * pool.length)];
        const id = `${chosen.contestId}${chosen.index}`;
        usedIds.add(id);
        selected.push({
            id,
            contestId: chosen.contestId,
            index: chosen.index,
            name: chosen.name,
            rating: chosen.rating,
            url: `https://codeforces.com/problemset/problem/${chosen.contestId}/${chosen.index}`,
            points: cfg.points || 500
        });
    }

    return selected;
}

async function generateRoomProblemForConfig(configProblem = {}, excludedIds = []) {
    const generated = await generateRoomProblems([configProblem], excludedIds);
    if (!generated.length) {
        throw new Error('Failed to generate next problem');
    }
    return generated[0];
}

async function startBattleForPair(room, startP1, startP2) {
    if (!room || (room.battleState && room.battleState.status === 'running')) return;

    const excludedIds = room.validationProblem ? [room.validationProblem.id] : [];
    let firstProblem = room.preGeneratedFirstProblem;
    if (!firstProblem) {
        firstProblem = await generateRoomProblemForConfig(room.problems[0] || { points: 500, rating: 1200 }, excludedIds);
    }
    room.preGeneratedFirstProblem = null;

    const selectedProblems = Array.from({ length: room.problems.length }, () => null);
    selectedProblems[0] = firstProblem;

    const usedProblemIds = [...excludedIds];
    if (!usedProblemIds.includes(firstProblem.id)) {
        usedProblemIds.push(firstProblem.id);
    }

    const startsAt = Date.now();
    const endsAt = startsAt + (room.duration * 60 * 1000);
    const cleanupAt = endsAt + ROOM_CLEANUP_DELAY_MS;

    room.battleState = {
        status: 'running',
        startsAt,
        endsAt,
        cleanupAt,
        player1Handle: startP1,
        player2Handle: startP2,
        selectedProblems,
        usedProblemIds,
        problemConfigs: room.problems,
        generatedProblemLocks: {},
        solveAnnouncements: {},
        duration: room.duration,
        interval: room.interval,
        roomId: room.id
    };

    if (room.endTimeout) {
        clearTimeout(room.endTimeout);
    }

    room.endTimeout = setTimeout(() => {
        const targetRoom = rooms.get(room.id);
        if (!targetRoom || !targetRoom.battleState) return;
        finalizeBattle(targetRoom, 'timer');
    }, Math.max(0, endsAt - Date.now()));

    scheduleRoomCleanup(room);

    sendToRoom(room, {
        type: 'BATTLE_STARTED',
        roomId: room.id,
        battleState: room.battleState
    });

    broadcastActiveRooms();
}

async function evaluateRoomValidationAndAutoStart(room) {
    if (!room) return;
    if (room.battleState && room.battleState.status === 'running') return;
    if (isBattleEnded(room) || isRoomExpired(room)) return;
    if (room.validationCheckInProgress || room.startInProgress || room.countdownInProgress) return;

    const { pair, waitMessage } = getAutoStartPair(room);
    if (!pair) {
        broadcastValidationStatus(room, {
            pair: [],
            statuses: {},
            message: waitMessage || 'Waiting for two participants to join room.'
        });
        return;
    }

    const [p1, p2] = pair;

    room.validationCheckInProgress = true;
    try {
        const [validP1, validP2, p1HasCE, p2HasCE] = await Promise.all([
            validateHandle(p1),
            validateHandle(p2),
            hasCompilationErrorOnProblem(p1, room.validationProblem),
            hasCompilationErrorOnProblem(p2, room.validationProblem)
        ]);

        const statuses = {
            [p1]: !!(validP1 && p1HasCE),
            [p2]: !!(validP2 && p2HasCE)
        };

        let message = 'Waiting for match creator and selected opponent to submit Compilation Error to the provided problem.';
        if (!validP1 || !validP2) {
            message = 'One of the selected participant handles is invalid on Codeforces.';
        } else if (statuses[p1] && statuses[p2]) {
            message = 'Both participants verified. Match starts in 15 seconds.';
        } else if (!statuses[p1] && statuses[p2]) {
            message = `Waiting for ${p1} to submit Compilation Error to the provided problem.`;
        } else if (statuses[p1] && !statuses[p2]) {
            message = `Waiting for ${p2} to submit Compilation Error to the provided problem.`;
        }

        broadcastValidationStatus(room, {
            pair,
            statuses,
            message
        });

        if (validP1 && validP2 && statuses[p1] && statuses[p2] && !room.countdownInProgress) {
            const excludedIds = room.validationProblem ? [room.validationProblem.id] : [];
            try {
                room.preGeneratedFirstProblem = await generateRoomProblemForConfig(room.problems[0] || { points: 500, rating: 1200 }, excludedIds);
            } catch (generationError) {
                console.error('Problem generation before countdown failed:', generationError);
                broadcastValidationStatus(room, {
                    pair,
                    statuses,
                    message: 'Could not generate battle problems. Retrying validation check...'
                });
                room.preGeneratedFirstProblem = null;
                return;
            }

            room.countdownInProgress = true;
            room.countdownEndsAt = Date.now() + MATCH_START_COUNTDOWN_MS;

            sendToRoom(room, {
                type: 'MATCH_COUNTDOWN_STARTED',
                roomId: room.id,
                startsAt: room.countdownEndsAt,
                seconds: 15,
                pair: [p1, p2]
            });

            room.countdownTimeout = setTimeout(async () => {
                const targetRoom = rooms.get(room.id);
                if (!targetRoom) return;
                if (targetRoom.battleState && targetRoom.battleState.status === 'running') return;

                const { pair: livePair } = getAutoStartPair(targetRoom);
                const canStartWithPair = !!livePair
                    && livePair.length === 2
                    && livePair[0] === p1
                    && livePair[1] === p2;
                if (!canStartWithPair) {
                    targetRoom.countdownInProgress = false;
                    targetRoom.countdownEndsAt = null;
                    targetRoom.countdownTimeout = null;
                    targetRoom.preGeneratedFirstProblem = null;
                    await evaluateRoomValidationAndAutoStart(targetRoom);
                    return;
                }

                targetRoom.startInProgress = true;
                try {
                    await startBattleForPair(targetRoom, p1, p2);
                } catch (error) {
                    console.error('Failed to start battle after countdown:', error);
                } finally {
                    targetRoom.startInProgress = false;
                    targetRoom.countdownInProgress = false;
                    targetRoom.countdownEndsAt = null;
                    targetRoom.countdownTimeout = null;
                }
            }, MATCH_START_COUNTDOWN_MS);
        }
    } catch (error) {
        console.error('Validation auto-start check failed:', error);
    } finally {
        room.validationCheckInProgress = false;
    }
}

function scheduleRoomCleanup(room) {
    if (!room.battleState || !room.battleState.cleanupAt) return;
    if (room.cleanupTimeout) {
        clearTimeout(room.cleanupTimeout);
    }

    const delay = Math.max(0, room.battleState.cleanupAt - Date.now());
    room.cleanupTimeout = setTimeout(() => {
        const currentRoom = rooms.get(room.id);
        if (!currentRoom) return;

        sendToRoom(currentRoom, {
            type: 'ROOM_CLOSED',
            roomId: currentRoom.id,
            message: 'This blitz room has ended and moved to past results.'
        });

        rooms.delete(currentRoom.id);
        broadcastActiveRooms();
    }, delay);
}

function cleanupUnstartedRoomIfHostLeft(room, leftHandle) {
    if (!room || room.battleState) return false;
    if (leftHandle !== room.host) return false;

    if (room.noOpponentTimeout) {
        clearTimeout(room.noOpponentTimeout);
        room.noOpponentTimeout = null;
    }

    if (room.countdownTimeout) {
        clearTimeout(room.countdownTimeout);
        room.countdownTimeout = null;
    }

    rooms.delete(room.id);
    return true;
}

// Broadcast active rooms
function broadcastActiveRooms() {
    const activeRooms = Array.from(rooms.values())
    .filter(room => !isRoomExpired(room))
    .filter(room => !isBattleEnded(room))
    .map(room => ({
        id: room.id,
        name: room.name,
        players: getConnectedPlayersCount(room),
        assignedPlayers: getAssignedPlayersCount(room),
        duration: room.duration,
        interval: room.interval,
        problems: room.problems.length,
        battleRunning: isBattleRunning(room)
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
                    await handleCreateRoom(ws, data);
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

                case 'END_BATTLE_EARLY':
                    handleEndBattleEarly(ws, data);
                    break;

                case 'PROBLEM_SOLVED':
                    await handleProblemSolved(ws, data);
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
        for (const [_, room] of rooms.entries()) {
            const playerIndex = room.players.findIndex(player => player.ws === ws);
            if (playerIndex !== -1) {
                const leftHandle = room.players[playerIndex].handle;
                room.players[playerIndex].ws = null;

                if (cleanupUnstartedRoomIfHostLeft(room, leftHandle)) {
                    broadcastActiveRooms();
                    break;
                }

                broadcastActiveRooms();
                break;
            }
        }
    });
});

async function handleCreateRoom(ws, data) {
    const roomName = (data.roomName || '').trim() || `${data.handle}'s Room`;
    const opponentHandle = (data.opponentHandle || '').trim();

    if (roomNameTaken(roomName)) {
        ws.send(JSON.stringify({
            type: 'CREATE_ERROR',
            message: 'Room name already exists. Please choose a unique room name.'
        }));
        return;
    }

    if (!opponentHandle) {
        ws.send(JSON.stringify({
            type: 'CREATE_ERROR',
            message: 'Opponent handle is required.'
        }));
        return;
    }

    if (opponentHandle === data.handle) {
        ws.send(JSON.stringify({
            type: 'CREATE_ERROR',
            message: 'Opponent handle must be different from your handle.'
        }));
        return;
    }

    const opponentValid = await validateHandle(opponentHandle).catch(() => false);
    if (!opponentValid) {
        ws.send(JSON.stringify({
            type: 'CREATE_ERROR',
            message: 'Given opponent handle does not exist on Codeforces.'
        }));
        return;
    }

    const roomId = generateRoomId();
    let validationProblem;

    try {
        validationProblem = await generateValidationProblem();
    } catch (error) {
        ws.send(JSON.stringify({
            type: 'CREATE_ERROR',
            message: 'Could not generate validation problem. Please try again.'
        }));
        return;
    }
    
    const room = {
        id: roomId,
        name: roomName,
        players: [
            { handle: data.handle, ws }
        ],
        host: data.handle,
        opponentHandle,
        duration: data.duration,
        interval: data.interval,
        problems: data.problems,
        validationProblem,
        battleState: null,
        createdAt: Date.now(),
        endTimeout: null,
        cleanupTimeout: null,
        noOpponentTimeout: null,
        countdownTimeout: null,
        countdownEndsAt: null,
        countdownInProgress: false,
        preGeneratedFirstProblem: null,
        validationCheckInProgress: false,
        startInProgress: false
    };
    
    rooms.set(roomId, room);
    
    ws.send(JSON.stringify({
        type: 'ROOM_CREATED',
        roomId: roomId,
        roomName: roomName,
        opponentHandle: room.opponentHandle,
        duration: data.duration,
        interval: data.interval,
        problems: data.problems,
        validationProblem
    }));

    room.noOpponentTimeout = setTimeout(() => {
        const currentRoom = rooms.get(roomId);
        if (!currentRoom) return;
        if (currentRoom.battleState) return;
        if (getAssignedPlayersCount(currentRoom) >= 2) return;

        sendToRoom(currentRoom, {
            type: 'ROOM_CLOSED',
            roomId: currentRoom.id,
            message: 'Room closed: no opponent joined within 5 minutes.'
        });

        rooms.delete(roomId);
        broadcastActiveRooms();
    }, ROOM_NO_OPPONENT_TIMEOUT_MS);

    evaluateRoomValidationAndAutoStart(room).catch(() => {});
    
    broadcastActiveRooms();
}

function handleEndBattleEarly(ws, data) {
    const room = rooms.get(data.roomId);
    if (!room || !room.battleState || room.battleState.status !== 'running') return;

    const sender = room.players.find(player => player.ws === ws);
    if (!sender || !sender.handle) return;

    finalizeBattle(room, data.reason || 'all-problems-solved');
}

async function handleProblemSolved(ws, data) {
    const room = rooms.get(data.roomId);
    if (!room || !room.battleState || room.battleState.status !== 'running') return;

    const sender = room.players.find(player => player.ws === ws);
    if (!sender || !sender.handle) return;

    const solverHandle = (data.solverHandle || '').trim();
    const problemId = (data.problemId || '').trim();
    const problemNumber = data.problemNumber;
    if (!solverHandle || !problemId) return;

    if (!room.players.some(player => player.handle === solverHandle)) return;

    if (!room.battleState.solveAnnouncements) {
        room.battleState.solveAnnouncements = {};
    }

    const solveKey = `${problemId}:${solverHandle}`;
    if (room.battleState.solveAnnouncements[solveKey]) return;
    room.battleState.solveAnnouncements[solveKey] = true;

    sendToRoom(room, {
        type: 'PROBLEM_SOLVED',
        roomId: room.id,
        solverHandle,
        problemId,
        problemNumber,
        solveKey
    });

    const totalProblems = (room.battleState.problemConfigs || room.problems || []).length;
    const solvedProblemNumber = Number(problemNumber) || 0;
    if (solvedProblemNumber < 1 || solvedProblemNumber >= totalProblems) {
        return;
    }

    const nextProblemNumber = solvedProblemNumber + 1;
    const nextProblemIndex = nextProblemNumber - 1;
    if (!room.battleState.selectedProblems) {
        room.battleState.selectedProblems = Array.from({ length: totalProblems }, () => null);
    }
    if (room.battleState.selectedProblems[nextProblemIndex]) {
        return;
    }

    if (!room.battleState.generatedProblemLocks) {
        room.battleState.generatedProblemLocks = {};
    }
    if (room.battleState.generatedProblemLocks[nextProblemNumber]) {
        return;
    }

    room.battleState.generatedProblemLocks[nextProblemNumber] = true;
    try {
        const problemConfigs = room.battleState.problemConfigs || room.problems || [];
        const targetConfig = problemConfigs[nextProblemIndex] || { points: 500, rating: 1200 };
        const usedProblemIds = Array.isArray(room.battleState.usedProblemIds)
            ? room.battleState.usedProblemIds
            : [];

        const nextProblem = await generateRoomProblemForConfig(targetConfig, usedProblemIds);
        room.battleState.selectedProblems[nextProblemIndex] = nextProblem;
        if (!room.battleState.usedProblemIds.includes(nextProblem.id)) {
            room.battleState.usedProblemIds.push(nextProblem.id);
        }

        sendToRoom(room, {
            type: 'NEXT_PROBLEM_READY',
            roomId: room.id,
            problemNumber: nextProblemNumber,
            problem: nextProblem
        });
    } catch (error) {
        console.error('Failed to generate next problem:', error);
        sendToRoom(room, {
            type: 'NEXT_PROBLEM_ERROR',
            roomId: room.id,
            problemNumber: nextProblemNumber,
            message: 'Could not generate next problem right now. Please wait and solve refresh/rejoin if needed.'
        });
    } finally {
        delete room.battleState.generatedProblemLocks[nextProblemNumber];
    }
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
    
    if (isRoomExpired(room)) {
        ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            message: 'This blitz room already ended and moved to past results.'
        }));
        return;
    }

    if (isBattleEnded(room)) {
        ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            message: 'This blitz room already ended and moved to past results.'
        }));
        return;
    }


    const existingIndex = room.players.findIndex(player => player.handle === data.handle);
    if (existingIndex !== -1) {
        room.players[existingIndex].ws = ws;
        
        ws.send(JSON.stringify({
            type: 'REJOIN_SUCCESS',
            roomId: room.id,
            roomData: getRoomPublicState(room),
            isHost: room.host === data.handle
        }));
        
        sendToRoom(room, {
            type: 'PLAYER_RECONNECTED',
            handle: data.handle,
            players: room.players.filter(p => !!p.handle).map(p => p.handle)
        });
        
        broadcastActiveRooms();
        return;
    }

    room.players.push({ handle: data.handle, ws });

    if (room.noOpponentTimeout && getAssignedPlayersCount(room) >= 2) {
        clearTimeout(room.noOpponentTimeout);
        room.noOpponentTimeout = null;
    }
    
    room.players.forEach((player, index) => {
        if (player.ws) {
            player.ws.send(JSON.stringify({
                type: 'ROOM_JOINED',
                roomId: room.id,
                roomName: room.name,
                playerIndex: index,
                players: room.players.filter(p => !!p.handle).map(p => p.handle),
                isHost: room.host === player.handle,
                opponentHandle: room.opponentHandle,
                duration: room.duration,
                interval: room.interval,
                problems: room.problems,
                validationProblem: room.validationProblem,
                countdownInProgress: !!room.countdownInProgress,
                countdownEndsAt: room.countdownEndsAt || null
            }));
        }
    });

    evaluateRoomValidationAndAutoStart(room).catch(() => {});
    
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
    
    const playerIndex = room.players.findIndex(player => player.handle === data.handle);
    if (playerIndex === -1) {
        ws.send(JSON.stringify({
            type: 'JOIN_ERROR',
            message: 'Player not found in room'
        }));
        return;
    }

    room.players[playerIndex].ws = ws;
    
    ws.send(JSON.stringify({
        type: 'REJOIN_SUCCESS',
        roomId: room.id,
        roomData: getRoomPublicState(room),
        isHost: room.host === data.handle
    }));
    
    sendToRoom(room, {
        type: 'PLAYER_RECONNECTED',
        handle: data.handle,
        players: room.players.filter(p => !!p.handle).map(p => p.handle)
    });

    evaluateRoomValidationAndAutoStart(room).catch(() => {});
    
    broadcastActiveRooms();
}

function handleLeaveRoom(ws, data) {
    const room = rooms.get(data.roomId);
    if (!room) return;
    
    const playerIndex = room.players.findIndex(player => player.ws === ws);
    if (playerIndex !== -1) {
        const leftHandle = room.players[playerIndex].handle;
        room.players[playerIndex].ws = null;
        
        sendToRoom(room, {
            type: 'PLAYER_LEFT',
            handle: leftHandle,
            players: room.players.filter(p => !!p.handle).map(p => p.handle)
        });

        if (cleanupUnstartedRoomIfHostLeft(room, leftHandle)) {
            broadcastActiveRooms();
            return;
        }

        evaluateRoomValidationAndAutoStart(room).catch(() => {});
        
        broadcastActiveRooms();
    }
}

async function handleStartBattle(ws, data) {
    const room = rooms.get(data.roomId);
    if (!room) return;

    if (getAssignedPlayersCount(room) < 2) {
        ws.send(JSON.stringify({
            type: 'START_ERROR',
            message: 'At least two participants are required to start battle.'
        }));
        return;
    }

    if (room.battleState && room.battleState.status === 'running') {
        ws.send(JSON.stringify({
            type: 'START_ERROR',
            message: 'Battle is already running.'
        }));
        return;
    }

    evaluateRoomValidationAndAutoStart(room).catch(error => {
        console.error('Manual trigger for auto-start failed:', error);
    });

    ws.send(JSON.stringify({
        type: 'START_ERROR',
        message: 'Auto-start enabled: battle will start immediately after two participants submit Compilation Error on generated problem.'
    }));
}

function sendActiveRooms(ws) {
    const activeRooms = Array.from(rooms.values())
    .filter(room => !isRoomExpired(room))
    .filter(room => !isBattleEnded(room))
    .map(room => ({
        id: room.id,
        name: room.name,
        players: getConnectedPlayersCount(room),
        assignedPlayers: getAssignedPlayersCount(room),
        duration: room.duration,
        interval: room.interval,
        problems: room.problems.length,
        battleRunning: isBattleRunning(room)
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
        const parsed = JSON.parse(data);
        const { normalized, changed } = ensureSequentialBlitzNumbers(parsed);

        if (changed) {
            await fs.writeFile(RESULTS_FILE, JSON.stringify(normalized, null, 2));
        }

        res.json(normalized);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/results', async (req, res) => {
    try {
        const current = JSON.parse(await fs.readFile(RESULTS_FILE, 'utf8'));
        const normalizedState = ensureSequentialBlitzNumbers(current);
        let results = normalizedState.normalized;
        const payload = req.body || {};
        const key = payload.matchKey;

        if (key) {
            const existingIndex = results.findIndex(item => item.matchKey === key);
            if (existingIndex >= 0) {
                const existingNumber = results[existingIndex].blitzNumber;
                results[existingIndex] = {
                    ...payload,
                    blitzNumber: existingNumber
                };
            } else {

            const finalState = ensureSequentialBlitzNumbers(results);
            results = finalState.normalized;
                const maxBlitzNumber = results.reduce((max, item) => {
                    const value = Number(item.blitzNumber) || 0;
                    return Math.max(max, value);
                }, 0);
                results.push({
                    ...payload,
                    blitzNumber: maxBlitzNumber + 1
                });
            }
        } else {
            const maxBlitzNumber = results.reduce((max, item) => {
                const value = Number(item.blitzNumber) || 0;
                return Math.max(max, value);
            }, 0);
            results.push({
                ...payload,
                blitzNumber: maxBlitzNumber + 1
            });
        }

        await fs.writeFile(RESULTS_FILE, JSON.stringify(results, null, 2));

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'RESULTS_UPDATED' }));
            }
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.delete('/api/results', async (req, res) => {
    try {
        await fs.writeFile(RESULTS_FILE, JSON.stringify([]));

        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'RESULTS_UPDATED' }));
            }
        });

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

initResultsFile().then(() => {
    setInterval(() => {
        rooms.forEach(room => {
            evaluateRoomValidationAndAutoStart(room).catch(() => {});
        });
    }, 7000);

    server.listen(PORT, () => {
        console.log(`Server running on https://blitzing-2.onrender.com`);
    });
});
