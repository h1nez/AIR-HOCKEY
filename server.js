import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSONFilePreset } from 'lowdb/node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Инициализация базы данных (создаст db.json)
const defaultData = { users: [] };
const db = await JSONFilePreset('db.json', defaultData);

app.use(express.static(path.join(__dirname, 'public')));

// Настройки поля
const WIDTH = 800;
const HEIGHT = 400;
const PUCK_RADIUS = 15;
const PLAYER_RADIUS = 30;
const GOAL_HEIGHT = 150;
const GOAL_TOP = (HEIGHT - GOAL_HEIGHT) / 2;
const GOAL_BOTTOM = (HEIGHT + GOAL_HEIGHT) / 2;
const WIN_SCORE = 11;

let gameState = {
    puck: { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 },
    player1: { id: null, name: "Гость 1", x: 80, y: HEIGHT / 2, score: 0, rating: 1000, speedX: 0, speedY: 0 },
    player2: { id: null, name: "Гость 2", x: WIDTH - 80, y: HEIGHT / 2, score: 0, rating: 1000, speedX: 0, speedY: 0 },
    paused: true
};

// Функция расчета рейтинга Эло
function updateRatings(winner, loser) {
    const K = 32;
    const expectedWin = 1 / (1 + Math.pow(10, (loser.rating - winner.rating) / 400));
    const points = Math.round(K * (1 - expectedWin));
    
    winner.rating += points;
    loser.rating -= points;
    return points;
}

// Поиск или создание пользователя в БД
async function getOrCreateUser(name) {
    await db.read();
    let user = db.data.users.find(u => u.name === name);
    if (!user) {
        user = { name: name, rating: 1000 };
        db.data.users.push(user);
        await db.write();
    }
    return user;
}

function teleportToStart() {
    gameState.puck.x = WIDTH / 2;
    gameState.puck.y = HEIGHT / 2;
    gameState.puck.vx = 0;
    gameState.puck.vy = 0;
    gameState.player1.x = 80;
    gameState.player1.y = HEIGHT / 2;
    gameState.player2.x = WIDTH - 80;
    gameState.player2.y = HEIGHT / 2;
}

async function handleGoal(winnerRole) {
    gameState.paused = true;
    teleportToStart();

    const p1 = gameState.player1;
    const p2 = gameState.player2;
    const winner = winnerRole === 'player1' ? p1 : p2;
    const loser = winnerRole === 'player1' ? p2 : p1;

    // ПРОВЕРКА КОНЦА МАТЧА
    if (winner.score >= WIN_SCORE) {
        const pointsGained = updateRatings(winner, loser);
        
        // Сохраняем в БД
        await db.read();
        const dbWinner = db.data.users.find(u => u.name === winner.name);
        const dbLoser = db.data.users.find(u => u.name === loser.name);
        dbWinner.rating = winner.rating;
        dbLoser.rating = loser.rating;
        await db.write();

        io.to(winner.id).emit('goalNotify', { msg: `ПОБЕДА! +${pointsGained} рейтинга 🏆`, color: "#ffd700" });
        io.to(loser.id).emit('goalNotify', { msg: `ПОРАЖЕНИЕ. -${pointsGained} рейтинга 🏳️`, color: "#888" });

        setTimeout(() => {
            p1.score = 0; p2.score = 0;
            gameState.paused = false;
            gameState.puck.vx = (winnerRole === 'player1') ? 5 : -5;
            io.emit('goalNotify', { msg: "", color: "transparent" });
        }, 5000);
        return;
    }

    // Обычный гол
    io.to(winner.id).emit('goalNotify', { msg: "ГОЛ! 🥅", color: "#00ff00" });
    io.to(loser.id).emit('goalNotify', { msg: "ПРОПУСТИЛ... 👎", color: "#ff4444" });

    setTimeout(() => {
        gameState.puck.vx = (winnerRole === 'player1') ? 4 : -4;
        gameState.paused = false;
        io.emit('goalNotify', { msg: "", color: "transparent" });
    }, 2000);
}

// Физика (collision и interval остаются такими же, но с горизонтальными правками)
function resolveCollision(puck, player) {
    const dx = puck.x - player.x;
    const dy = puck.y - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = PUCK_RADIUS + PLAYER_RADIUS;
    if (distance < minDistance && distance > 0) {
        const nx = dx / distance; const ny = dy / distance;
        puck.x = player.x + nx * minDistance; puck.y = player.y + ny * minDistance;
        const dotProduct = puck.vx * nx + puck.vy * ny;
        puck.vx = (puck.vx - 2 * dotProduct * nx) + player.speedX * 0.6;
        puck.vy = (puck.vy - 2 * dotProduct * ny) + player.speedY * 0.6;
    }
}

setInterval(() => {
    if (gameState.paused) { io.emit('gameStateUpdate', gameState); return; }
    gameState.puck.vx *= 0.985; gameState.puck.vy *= 0.985;
    gameState.puck.x += gameState.puck.vx; gameState.puck.y += gameState.puck.vy;

    if (gameState.puck.y - PUCK_RADIUS < 0 || gameState.puck.y + PUCK_RADIUS > HEIGHT) {
        gameState.puck.vy *= -1; gameState.puck.y = gameState.puck.y < HEIGHT/2 ? PUCK_RADIUS : HEIGHT - PUCK_RADIUS;
    }
    if (gameState.puck.x - PUCK_RADIUS < 0) {
        if (gameState.puck.y > GOAL_TOP && gameState.puck.y < GOAL_BOTTOM) { gameState.player2.score++; handleGoal('player2'); }
        else { gameState.puck.x = PUCK_RADIUS; gameState.puck.vx *= -1; }
    } else if (gameState.puck.x + PUCK_RADIUS > WIDTH) {
        if (gameState.puck.y > GOAL_TOP && gameState.puck.y < GOAL_BOTTOM) { gameState.player1.score++; handleGoal('player1'); }
        else { gameState.puck.x = WIDTH - PUCK_RADIUS; gameState.puck.vx *= -1; }
    }
    resolveCollision(gameState.puck, gameState.player1);
    resolveCollision(gameState.puck, gameState.player2);
    io.emit('gameStateUpdate', gameState);
}, 1000 / 60);

io.on('connection', (socket) => {
    socket.on('joinGame', async (name) => {
        const user = await getOrCreateUser(name);
        if (!gameState.player1.id) {
            gameState.player1.id = socket.id;
            gameState.player1.name = user.name;
            gameState.player1.rating = user.rating;
            socket.emit('role', 'player1');
        } else if (!gameState.player2.id) {
            gameState.player2.id = socket.id;
            gameState.player2.name = user.name;
            gameState.player2.rating = user.rating;
            socket.emit('role', 'player2');
            gameState.paused = false;
        }
    });

    socket.on('input', (data) => {
        const p = (socket.id === gameState.player1.id) ? gameState.player1 : (socket.id === gameState.player2.id ? gameState.player2 : null);
        if (p && !gameState.paused) {
            let tx = data.x;
            if (p === gameState.player1) tx = Math.max(PLAYER_RADIUS, Math.min(WIDTH/2 - PLAYER_RADIUS, tx));
            else tx = Math.max(WIDTH/2 + PLAYER_RADIUS, Math.min(WIDTH - PLAYER_RADIUS, tx));
            let ty = Math.max(PLAYER_RADIUS, Math.min(HEIGHT - PLAYER_RADIUS, data.y));
            p.speedX = tx - p.x; p.speedY = ty - p.y;
            p.x = tx; p.y = ty;
        }
    });

    socket.on('disconnect', () => {
        if (socket.id === gameState.player1.id) { gameState.player1.id = null; gameState.paused = true; }
        if (socket.id === gameState.player2.id) { gameState.player2.id = null; gameState.paused = true; }
    });
});

server.listen(3000, () => console.log('Rating Hockey: http://localhost:3000'));