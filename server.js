import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSONFilePreset } from 'lowdb/node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);

// Оптимизация Socket.io для уменьшения пинга
const io = new Server(server, {
    transports: ["websocket"], 
    pingInterval: 2000,
    pingTimeout: 5000
});

const defaultData = { users: [] };
const db = await JSONFilePreset('db.json', defaultData);

app.use(express.static(path.join(__dirname, 'public')));

const WIDTH = 800;
const HEIGHT = 400;
const PUCK_RADIUS = 22;   // Было 15
const PLAYER_RADIUS = 35; // Было 30
const GOAL_TOP = 125;
const GOAL_BOTTOM = 275;
const WIN_SCORE = 5;

let gameState = {
    puck: { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 },
    player1: { id: null, name: "...", x: 80, y: 200, score: 0, rating: 1000, speedX: 0, speedY: 0 },
    player2: { id: null, name: "...", x: 720, y: 200, score: 0, rating: 1000, speedX: 0, speedY: 0 },
    paused: true
};

function calculateElo(winR, loseR) {
    const K = 32;
    const exp = 1 / (1 + Math.pow(10, (loseR - winR) / 400));
    return Math.round(K * (1 - exp));
}

async function handleGoal(winnerRole) {
    gameState.paused = true;
    const p1 = gameState.player1;
    const p2 = gameState.player2;
    const winner = winnerRole === 'player1' ? p1 : p2;
    const loser = winnerRole === 'player1' ? p2 : p1;

    if (winner.score >= WIN_SCORE) {
        const diff = calculateElo(winner.rating, loser.rating);
        winner.rating += diff; loser.rating -= diff;
        await db.read();
        db.data.users.find(u => u.name === winner.name).rating = winner.rating;
        db.data.users.find(u => u.name === loser.name).rating = loser.rating;
        await db.write();
        io.emit('goalNotify', { msg: `МАТЧ ОКОНЧЕН! ПОБЕДИТЕЛЬ: ${winner.name}`, color: "gold" });
        setTimeout(() => {
            p1.score = 0; p2.score = 0;
            resetPositions(winnerRole);
        }, 5000);
    } else {
        io.emit('goalNotify', { msg: `ГОЛ ЗАБИЛ ${winner.name}!`, color: winnerRole === 'player1' ? '#4444ff' : '#ff4444' });
        setTimeout(() => resetPositions(winnerRole), 2000);
    }
}

function resetPositions(lastWinner) {
    gameState.puck = { x: WIDTH / 2, y: HEIGHT / 2, vx: lastWinner === 'player1' ? 4 : -4, vy: 0 };
    gameState.player1.x = 80; gameState.player1.y = 200;
    gameState.player2.x = 720; gameState.player2.y = 200;
    gameState.paused = false;
    io.emit('goalNotify', { msg: "", color: "" });
}

function resolveCollision(puck, player) {
    const dx = puck.x - player.x;
    const dy = puck.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < PUCK_RADIUS + PLAYER_RADIUS) {
        const nx = dx / dist; const ny = dy / dist;
        puck.x = player.x + nx * (PUCK_RADIUS + PLAYER_RADIUS);
        puck.y = player.y + ny * (PUCK_RADIUS + PLAYER_RADIUS);
        const dot = puck.vx * nx + puck.vy * ny;
        puck.vx = (puck.vx - 2 * dot * nx) + player.speedX * 0.5;
        puck.vy = (puck.vy - 2 * dot * ny) + player.speedY * 0.5;
    }
}

setInterval(() => {
    if (!gameState.paused) {
        gameState.puck.x += (gameState.puck.vx *= 0.99);
        gameState.puck.y += (gameState.puck.vy *= 0.99);

        if (gameState.puck.y < 15 || gameState.puck.y > 385) gameState.puck.vy *= -1;
        
        if (gameState.puck.x < 15) {
            if (gameState.puck.y > GOAL_TOP && gameState.puck.y < GOAL_BOTTOM) {
                gameState.player2.score++; handleGoal('player2');
            } else { gameState.puck.x = 15; gameState.puck.vx *= -1; }
        }
        if (gameState.puck.x > 785) {
            if (gameState.puck.y > GOAL_TOP && gameState.puck.y < GOAL_BOTTOM) {
                gameState.player1.score++; handleGoal('player1');
            } else { gameState.puck.x = 785; gameState.puck.vx *= -1; }
        }
        resolveCollision(gameState.puck, gameState.player1);
        resolveCollision(gameState.puck, gameState.player2);
    }
    io.emit('gameStateUpdate', gameState);
}, 1000 / 45); // 45 FPS достаточно для сети

io.on('connection', (socket) => {
    socket.on('join', async (name) => {
        await db.read();
        let user = db.data.users.find(u => u.name === name);
        if (!user) { user = { name, rating: 1000 }; db.data.users.push(user); await db.write(); }
        
        if (!gameState.player1.id) {
            gameState.player1.id = socket.id; gameState.player1.name = name; gameState.player1.rating = user.rating;
        } else if (!gameState.player2.id) {
            gameState.player2.id = socket.id; gameState.player2.name = name; gameState.player2.rating = user.rating;
            gameState.paused = false;
        }
    });

    socket.on('input', (data) => {
        const p = socket.id === gameState.player1.id ? gameState.player1 : (socket.id === gameState.player2.id ? gameState.player2 : null);
        if (p && !gameState.paused) {
            const oldX = p.x; const oldY = p.y;
            p.x = p === gameState.player1 ? Math.min(370, Math.max(30, data.x)) : Math.min(770, Math.max(430, data.x));
            p.y = Math.min(370, Math.max(30, data.y));
            p.speedX = p.x - oldX; p.speedY = p.y - oldY;
        }
    });

    socket.on('disconnect', () => {
        if (socket.id === gameState.player1.id) { gameState.player1.id = null; gameState.paused = true; }
        if (socket.id === gameState.player2.id) { gameState.player2.id = null; gameState.paused = true; }
    });
});

server.listen(process.env.PORT || 3000);