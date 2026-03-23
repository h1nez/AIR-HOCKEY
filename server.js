import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSONFilePreset } from 'lowdb/node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);

// Настройка Socket.io для минимальной задержки
const io = new Server(server, {
    transports: ["websocket"], // Только быстрый протокол
    pingInterval: 2000,
    pingTimeout: 5000,
    cookie: false
});

// База данных рейтинга
const defaultData = { users: [] };
const db = await JSONFilePreset('db.json', defaultData);

app.use(express.static(path.join(__dirname, 'public')));

// ПАРАМЕТРЫ ПОЛЯ (Горизонтальное)
const WIDTH = 800;
const HEIGHT = 400;

// УВЕЛИЧЕННЫЕ РАДИУСЫ для компенсации лагов
const PUCK_RADIUS = 22;   // Было 15
const PLAYER_RADIUS = 35; // Было 30

const GOAL_TOP = 125;
const GOAL_BOTTOM = 275;
const WIN_SCORE = 11;

let gameState = {
    puck: { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 },
    player1: { id: null, name: "...", x: 80, y: 200, score: 0, rating: 1000, speedX: 0, speedY: 0 },
    player2: { id: null, name: "...", x: 720, y: 200, score: 0, rating: 1000, speedX: 0, speedY: 0 },
    paused: true
};

// Функция расчета рейтинга Эло
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
        const dbW = db.data.users.find(u => u.name === winner.name);
        const dbL = db.data.users.find(u => u.name === loser.name);
        if(dbW) dbW.rating = winner.rating;
        if(dbL) dbL.rating = loser.rating;
        await db.write();

        io.emit('goalNotify', { msg: `ЧЕМПИОН: ${winner.name} (+${diff} MMR)`, color: "gold" });
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
    const minDist = PUCK_RADIUS + PLAYER_RADIUS;

    if (dist < minDist) {
        const nx = dx / dist; const ny = dy / dist;
        // Выталкиваем шайбу, чтобы она не застревала в игроке
        puck.x = player.x + nx * minDist;
        puck.y = player.y + ny * minDist;

        const dot = puck.vx * nx + puck.vy * ny;
        // Физика отскока + передача инерции игрока
        puck.vx = (puck.vx - 2 * dot * nx) + player.speedX * 0.4;
        puck.vy = (puck.vy - 2 * dot * ny) + player.speedY * 0.4;
    }
}

// ГЛАВНЫЙ ЦИКЛ ФИЗИКИ
setInterval(() => {
    if (!gameState.paused) {
        // Трение (увеличено до 0.98 для стабильности при пинге)
        gameState.puck.vx *= 0.98;
        gameState.puck.vy *= 0.98;
        gameState.puck.x += gameState.puck.vx;
        gameState.puck.y += gameState.puck.vy;

        // Отскок от верхней и нижней стенок
        if (gameState.puck.y < PUCK_RADIUS || gameState.puck.y > HEIGHT - PUCK_RADIUS) {
            gameState.puck.vy *= -1;
            gameState.puck.y = gameState.puck.y < HEIGHT / 2 ? PUCK_RADIUS : HEIGHT - PUCK_RADIUS;
        }
        
        // Логика ворот
        if (gameState.puck.x < PUCK_RADIUS) {
            if (gameState.puck.y > GOAL_TOP && gameState.puck.y < GOAL_BOTTOM) {
                gameState.player2.score++; handleGoal('player2');
            } else { 
                gameState.puck.x = PUCK_RADIUS; gameState.puck.vx *= -1; 
            }
        }
        if (gameState.puck.x > WIDTH - PUCK_RADIUS) {
            if (gameState.puck.y > GOAL_TOP && gameState.puck.y < GOAL_BOTTOM) {
                gameState.player1.score++; handleGoal('player1');
            } else { 
                gameState.puck.x = WIDTH - PUCK_RADIUS; gameState.puck.vx *= -1; 
            }
        }

        resolveCollision(gameState.puck, gameState.player1);
        resolveCollision(gameState.puck, gameState.player2);
    }
    // Отправляем состояние всем игрокам
    io.emit('gameStateUpdate', gameState);
}, 1000 / 45); // Оптимальная частота для сетевой игры

io.on('connection', (socket) => {
    socket.on('join', async (name) => {
        await db.read();
        let user = db.data.users.find(u => u.name === name);
        if (!user) { 
            user = { name, rating: 1000 }; 
            db.data.users.push(user); 
            await db.write(); 
        }
        
        if (!gameState.player1.id) {
            gameState.player1.id = socket.id; 
            gameState.player1.name = name; 
            gameState.player1.rating = user.rating;
        } else if (!gameState.player2.id) {
            gameState.player2.id = socket.id; 
            gameState.player2.name = name; 
            gameState.player2.rating = user.rating;
            gameState.paused = false; // Начинаем игру, когда зашли двое
        }
    });

    socket.on('input', (data) => {
        const p = socket.id === gameState.player1.id ? gameState.player1 : (socket.id === gameState.player2.id ? gameState.player2 : null);
        if (p && !gameState.paused) {
            const oldX = p.x; const oldY = p.y;
            // Ограничения движения (своя половина поля)
            p.x = (p === gameState.player1) ? Math.min(WIDTH/2 - PLAYER_RADIUS, Math.max(PLAYER_RADIUS, data.x)) : Math.min(WIDTH - PLAYER_RADIUS, Math.max(WIDTH/2 + PLAYER_RADIUS, data.x));
            p.y = Math.min(HEIGHT - PLAYER_RADIUS, Math.max(PLAYER_RADIUS, data.y));
            
            // Расчет скорости для передачи импульса шайбе
            p.speedX = p.x - oldX; 
            p.speedY = p.y - oldY;
        }
    });

    socket.on('disconnect', () => {
        if (socket.id === gameState.player1.id) { gameState.player1.id = null; gameState.paused = true; }
        if (socket.id === gameState.player2.id) { gameState.player2.id = null; gameState.paused = true; }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Hockey Server started on port ${PORT}`));