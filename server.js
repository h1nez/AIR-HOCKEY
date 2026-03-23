import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { JSONFilePreset } from 'lowdb/node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    transports: ["websocket"],
    pingInterval: 2000,
    pingTimeout: 5000 
});

// Настройка пути базы данных для Windows
const dbPath = path.resolve(__dirname, 'db.json');
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ users: [] }, null, 2));
}
const db = await JSONFilePreset(dbPath, { users: [] });

app.use(express.static(path.join(__dirname, 'public')));

// КОНСТАНТЫ (Должны быть идентичны на клиенте)
const WIDTH = 800;
const HEIGHT = 400;
const PUCK_RADIUS = 22; 
const PLAYER_RADIUS = 35;
const GOAL_TOP = 125;
const GOAL_BOTTOM = 275;

let gameState = {
    puck: { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 },
    player1: { id: null, name: "...", x: 80, y: 200, score: 0, rating: 1000, speedX: 0, speedY: 0 },
    player2: { id: null, name: "...", x: 720, y: 200, score: 0, rating: 1000, speedX: 0, speedY: 0 },
    paused: true
};

// УЛУЧШЕННАЯ ФИЗИКА СТОЛКНОВЕНИЙ
function resolveCollision(puck, player) {
    const dx = puck.x - player.x;
    const dy = puck.y - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDist = PUCK_RADIUS + PLAYER_RADIUS;

    if (distance < minDist) {
        // 1. ЖЕСТКОЕ ВЫТАЛКИВАНИЕ (Решает проблему "залезания")
        const nx = dx / distance; // Вектор нормали X
        const ny = dy / distance; // Вектор нормали Y
        const overlap = minDist - distance;

        puck.x += nx * (overlap + 2); // Выталкиваем с запасом 2px
        puck.y += ny * (overlap + 2);

        // 2. РАСЧЕТ ОТСКОКА (Импульс)
        // Вычисляем относительную скорость шайбы к игроку
        const relVX = puck.vx - player.speedX;
        const relVY = puck.vy - player.speedY;
        const velAlongNormal = relVX * nx + relVY * ny;

        // Если объекты уже разлетаются, не считаем отскок
        if (velAlongNormal > 0) return;

        // Сила отскока (1.3 делает игру динамичнее)
        const restitution = 1.3;
        let j = -(1 + restitution) * velAlongNormal;

        puck.vx += j * nx;
        puck.vy += j * ny;

        // Добавляем инерцию от движения клюшки
        puck.vx += player.speedX * 0.4;
        puck.vy += player.speedY * 0.4;

        // Лимит скорости (чтобы не пролетала сквозь стены)
        const maxS = 18;
        const currentS = Math.sqrt(puck.vx**2 + puck.vy**2);
        if (currentS > maxS) {
            puck.vx = (puck.vx / currentS) * maxS;
            puck.vy = (puck.vy / currentS) * maxS;
        }
    }
}

async function handleGoal(winnerRole) {
    gameState.paused = true;
    const winner = winnerRole === 'player1' ? gameState.player1 : gameState.player2;
    const loser = winnerRole === 'player1' ? gameState.player2 : gameState.player1;

    if (winner.score >= 11) {
        const K = 32;
        const exp = 1 / (1 + Math.pow(10, (loser.rating - winner.rating) / 400));
        const diff = Math.round(K * (1 - exp));
        winner.rating += diff; loser.rating -= diff;
        
        await db.read();
        const u1 = db.data.users.find(u => u.name === winner.name);
        const u2 = db.data.users.find(u => u.name === loser.name);
        if(u1) u1.rating = winner.rating;
        if(u2) u2.rating = loser.rating;
        await db.write();

        io.emit('goalNotify', { msg: `ЧЕМПИОН: ${winner.name} (+${diff})`, color: "gold" });
        setTimeout(() => { 
            gameState.player1.score = 0; gameState.player2.score = 0; 
            resetGame(winnerRole); 
        }, 5000);
    } else {
        io.emit('goalNotify', { msg: `ГОЛ: ${winner.name}`, color: winnerRole === 'player1' ? '#4444ff' : '#ff4444' });
        setTimeout(() => resetGame(winnerRole), 2000);
    }
}

function resetGame(lastWin) {
    gameState.puck = { x: WIDTH / 2, y: HEIGHT / 2, vx: lastWin === 'player1' ? 5 : -5, vy: 0 };
    gameState.player1.x = 80; gameState.player1.y = 200;
    gameState.player2.x = 720; gameState.player2.y = 200;
    gameState.paused = false;
    io.emit('goalNotify', { msg: "", color: "" });
}

setInterval(() => {
    if (!gameState.paused) {
        gameState.puck.vx *= 0.985; gameState.puck.vy *= 0.985;
        gameState.puck.x += gameState.puck.vx; 
        gameState.puck.y += gameState.puck.vy;

        // Стенки
        if (gameState.puck.y < PUCK_RADIUS || gameState.puck.y > HEIGHT - PUCK_RADIUS) {
            gameState.puck.vy *= -1;
            gameState.puck.y = gameState.puck.y < HEIGHT/2 ? PUCK_RADIUS : HEIGHT - PUCK_RADIUS;
        }
        // Ворота
        if (gameState.puck.x < PUCK_RADIUS) {
            if (gameState.puck.y > GOAL_TOP && gameState.puck.y < GOAL_BOTTOM) {
                gameState.player2.score++; handleGoal('player2');
            } else { gameState.puck.x = PUCK_RADIUS; gameState.puck.vx *= -1; }
        }
        if (gameState.puck.x > WIDTH - PUCK_RADIUS) {
            if (gameState.puck.y > GOAL_TOP && gameState.puck.y < GOAL_BOTTOM) {
                gameState.player1.score++; handleGoal('player1');
            } else { gameState.puck.x = WIDTH - PUCK_RADIUS; gameState.puck.vx *= -1; }
        }
        resolveCollision(gameState.puck, gameState.player1);
        resolveCollision(gameState.puck, gameState.player2);
    }
    io.emit('gameStateUpdate', gameState);
}, 1000 / 45);

io.on('connection', (socket) => {
    socket.on('join', async (name) => {
        await db.read();
        let user = db.data.users.find(u => u.name === name);
        if (!user) { user = { name, rating: 1000 }; db.data.users.push(user); await db.write(); }
        if (!gameState.player1.id) {
            gameState.player1.id = socket.id; gameState.player1.name = name; 
            gameState.player1.rating = user.rating; socket.emit('role', 'p1');
        } else if (!gameState.player2.id) {
            gameState.player2.id = socket.id; gameState.player2.name = name; 
            gameState.player2.rating = user.rating; socket.emit('role', 'p2');
            gameState.paused = false;
        }
    });
    socket.on('input', (data) => {
        const p = socket.id === gameState.player1.id ? gameState.player1 : (socket.id === gameState.player2.id ? gameState.player2 : null);
        if (p && !gameState.paused) {
            const oldX = p.x; const oldY = p.y;
            p.x = (p === gameState.player1) ? Math.min(365, Math.max(35, data.x)) : Math.min(765, Math.max(435, data.x));
            p.y = Math.min(365, Math.max(35, data.y));
            p.speedX = p.x - oldX; p.speedY = p.y - oldY;
        }
    });
    socket.on('pingCheck', () => socket.emit('pongCheck'));
    socket.on('disconnect', () => {
        if (socket.id === gameState.player1.id) { gameState.player1.id = null; gameState.paused = true; }
        if (socket.id === gameState.player2.id) { gameState.player2.id = null; gameState.paused = true; }
    });
});
server.listen(process.env.PORT || 3000);