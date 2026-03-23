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

// Инициализация базы данных (хранит ники и MMR)
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
    player1: { id: null, name: "Ожидание...", x: 80, y: HEIGHT / 2, score: 0, rating: 1000, speedX: 0, speedY: 0 },
    player2: { id: null, name: "Ожидание...", x: WIDTH - 80, y: HEIGHT / 2, score: 0, rating: 1000, speedX: 0, speedY: 0 },
    paused: true
};

// Расчет изменения рейтинга (Система Эло)
function calculateEloChange(winnerRating, loserRating) {
    const K = 32;
    const expectedWin = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
    return Math.round(K * (1 - expectedWin));
}

async function getOrCreateUser(name) {
    await db.read();
    let user = db.data.users.find(u => u.name === name);
    if (!user) {
        user = { name, rating: 1000 };
        db.data.users.push(user);
        await db.write();
    }
    return user;
}

function resetPositions() {
    gameState.puck = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 };
    gameState.player1.x = 80; gameState.player1.y = HEIGHT / 2;
    gameState.player2.x = WIDTH - 80; gameState.player2.y = HEIGHT / 2;
}

async function handleGoal(winnerRole) {
    gameState.paused = true;
    resetPositions();

    const p1 = gameState.player1;
    const p2 = gameState.player2;
    const winner = winnerRole === 'player1' ? p1 : p2;
    const loser = winnerRole === 'player1' ? p2 : p1;

    if (winner.score >= WIN_SCORE) {
        const points = calculateEloChange(winner.rating, loser.rating);
        winner.rating += points;
        loser.rating -= points;

        // Сохранение в базу
        await db.read();
        db.data.users.find(u => u.name === winner.name).rating = winner.rating;
        db.data.users.find(u => u.name === loser.name).rating = loser.rating;
        await db.write();

        io.to(winner.id).emit('goalNotify', { msg: `ЧЕМПИОН! +${points} MMR 🏆`, color: "gold" });
        io.to(loser.id).emit('goalNotify', { msg: `ПОРАЖЕНИЕ. -${points} MMR 🏳️`, color: "#888" });

        setTimeout(() => {
            p1.score = 0; p2.score = 0;
            gameState.paused = false;
            gameState.puck.vx = (winnerRole === 'player1') ? 5 : -5;
            io.emit('goalNotify', { msg: "", color: "" });
        }, 5000);
    } else {
        io.to(winner.id).emit('goalNotify', { msg: "ГОЛ! 🥅", color: "#00ff00" });
        io.to(loser.id).emit('goalNotify', { msg: "ПРОПУСТИЛ... 👎", color: "#ff4444" });
        setTimeout(() => {
            gameState.paused = false;
            gameState.puck.vx = (winnerRole === 'player1') ? 4 : -4;
            io.emit('goalNotify', { msg: "", color: "" });
        }, 2000);
    }
}

function resolveCollision(puck, player) {
    const dx = puck.x - player.x;
    const dy = puck.y - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = PUCK_RADIUS + PLAYER_RADIUS;

    if (distance < minDistance && distance > 0) {
        const nx = dx / distance;
        const ny = dy / distance;
        puck.x = player.x + nx * minDistance;
        puck.y = player.y + ny * minDistance;

        const dotProduct = puck.vx * nx + puck.vy * ny;
        puck.vx = (puck.vx - 2 * dotProduct * nx) + player.speedX * 0.6;
        puck.vy = (puck.vy - 2 * dotProduct * ny) + player.speedY * 0.6;
    }
}

setInterval(() => {
    if (gameState.paused) {
        io.emit('gameStateUpdate', gameState);
        return; 
    }

    gameState.puck.vx *= 0.985;
    gameState.puck.vy *= 0.985;
    gameState.puck.x += gameState.puck.vx;
    gameState.puck.y += gameState.puck.vy;

    if (gameState.puck.y - PUCK_RADIUS < 0 || gameState.puck.y + PUCK_RADIUS > HEIGHT) {
        gameState.puck.vy *= -1;
        gameState.puck.y = gameState.puck.y < HEIGHT/2 ? PUCK_RADIUS : HEIGHT - PUCK_RADIUS;
    }

    if (gameState.puck.x - PUCK_RADIUS < 0) {
        if (gameState.puck.y > GOAL_TOP && gameState.puck.y < GOAL_BOTTOM) {
            gameState.player2.score++; handleGoal('player2');
        } else {
            gameState.puck.x = PUCK_RADIUS; gameState.puck.vx *= -1;
        }
    } else if (gameState.puck.x + PUCK_RADIUS > WIDTH) {
        if (gameState.puck.y > GOAL_TOP && gameState.puck.y < GOAL_BOTTOM) {
            gameState.player1.score++; handleGoal('player1');
        } else {
            gameState.puck.x = WIDTH - PUCK_RADIUS; gameState.puck.vx *= -1;
        }
    }

    resolveCollision(gameState.puck, gameState.player1);
    resolveCollision(gameState.puck, gameState.player2);
    io.emit('gameStateUpdate', gameState);
}, 1000 / 60);

io.on('connection', (socket) => {
    socket.on('join', async (name) => {
        const user = await getOrCreateUser(name);
        const p = !gameState.player1.id ? gameState.player1 : (!gameState.player2.id ? gameState.player2 : null);
        if (p) {
            p.id = socket.id; p.name = user.name; p.rating = user.rating;
            socket.emit('role', p === gameState.player1 ? 'p1' : 'p2');
            if (gameState.player1.id && gameState.player2.id) gameState.paused = false;
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));