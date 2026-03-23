import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose'; // Подключаем настоящую БД

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    transports: ["websocket"],
    pingInterval: 1000,
    pingTimeout: 3000 
});

// ==========================================
// 1. ПОДКЛЮЧЕНИЕ К MONGODB
// ==========================================
// Сюда мы позже вставим твою личную ссылку от MongoDB Atlas
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:davidik12@aerohockey.5bidt7s.mongodb.net/?appName=Aerohockey';

mongoose.connect(MONGODB_URI, { 
    family: 4, // ПРИНУДИТЕЛЬНО используем IPv4 (спасает от ETIMEOUT)
    serverSelectionTimeoutMS: 5000 // Ждем максимум 5 секунд
})
.then(() => {
    console.log('✅ Успешное подключение к MongoDB!');
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
})
.catch(err => {
    console.error('❌ Критическая ошибка БД:', err.message);
    process.exit(1);
});

// Создаем "Схему" игрока (как таблица в БД)
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    rating: { type: Number, default: 1000 }
});
const User = mongoose.model('User', userSchema);
// ==========================================

app.use(express.static(path.join(__dirname, 'public')));

const WIDTH = 800;
const HEIGHT = 400;
const PUCK_R = 22; 
const PLAYER_R = 35;

let gameState = {
    puck: { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 },
    player1: { id: null, name: "...", x: 80, y: 200, score: 0, rating: 1000, speedX: 0, speedY: 0 },
    player2: { id: null, name: "...", x: 720, y: 200, score: 0, rating: 1000, speedX: 0, speedY: 0 },
    paused: true
};

function resolveCollision(puck, player) {
    const dx = puck.x - player.x;
    const dy = puck.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = PUCK_R + PLAYER_R;

    if (dist < minDist) {
        const nx = dx / dist; 
        const ny = dy / dist; 

        puck.x = player.x + nx * (minDist + 0.1);
        puck.y = player.y + ny * (minDist + 0.1);

        const relVX = puck.vx - player.speedX;
        const relVY = puck.vy - player.speedY;
        const velNormal = relVX * nx + relVY * ny;

        if (velNormal > 0) return;

        const res = 1.6; 
        const impulse = -(1 + res) * velNormal;

        puck.vx += impulse * nx + (player.speedX * 0.8);
        puck.vy += impulse * ny + (player.speedY * 0.8);

        const maxSpeed = 28;
        const speed = Math.sqrt(puck.vx**2 + puck.vy**2);
        if (speed > maxSpeed) {
            puck.vx = (puck.vx / speed) * maxSpeed;
            puck.vy = (puck.vy / speed) * maxSpeed;
        }
    }
}

async function handleGoal(winRole) {
    gameState.paused = true;
    const win = winRole === 'player1' ? gameState.player1 : gameState.player2;
    const lose = winRole === 'player1' ? gameState.player2 : gameState.player1;
    win.score++;

    if (win.score >= 11) {
        const K = 32;
        const diff = Math.round(K * (1 - 1/(1+Math.pow(10,(lose.rating-win.rating)/400))));
        win.rating += diff; lose.rating -= diff;
        
        // --- СОХРАНЕНИЕ В MONGODB ---
        try {
            await User.findOneAndUpdate({ name: win.name }, { rating: win.rating });
            await User.findOneAndUpdate({ name: lose.name }, { rating: lose.rating });
            console.log(`💾 Рейтинг обновлен: ${win.name} (${win.rating}), ${lose.name} (${lose.rating})`);
        } catch (err) {
            console.error('Ошибка сохранения рейтинга:', err);
        }
        // ----------------------------

        io.emit('goalNotify', { msg: `ЧЕМПИОН: ${win.name} (+${diff})`, color: "gold" });
        setTimeout(() => { gameState.player1.score = 0; gameState.player2.score = 0; reset(winRole); }, 5000);
    } else {
        io.emit('goalNotify', { msg: `ГОЛ: ${win.name}`, color: winRole === 'player1' ? '#4444ff' : '#ff4444' });
        setTimeout(() => reset(winRole), 2000);
    }
}

function reset(lastWin) {
    gameState.puck = { x: WIDTH/2, y: HEIGHT/2, vx: lastWin === 'player1' ? 10 : -10, vy: 0 };
    gameState.player1.x = 80; gameState.player1.y = 200;
    gameState.player2.x = 720; gameState.player2.y = 200;
    gameState.paused = false;
    io.emit('goalNotify', { msg: "", color: "" });
}

setInterval(() => {
    if (!gameState.paused) {
        gameState.puck.vx *= 0.995; gameState.puck.vy *= 0.995;
        gameState.puck.x += gameState.puck.vx; 
        gameState.puck.y += gameState.puck.vy;
        
        if (gameState.puck.y < PUCK_R) { gameState.puck.y = PUCK_R; gameState.puck.vy *= -1; }
        if (gameState.puck.y > HEIGHT - PUCK_R) { gameState.puck.y = HEIGHT - PUCK_R; gameState.puck.vy *= -1; }

        if (gameState.puck.x < PUCK_R) {
            if (gameState.puck.y > 125 && gameState.puck.y < 275) handleGoal('player2');
            else { gameState.puck.x = PUCK_R; gameState.puck.vx *= -1; }
        }
        if (gameState.puck.x > WIDTH - PUCK_R) {
            if (gameState.puck.y > 125 && gameState.puck.y < 275) handleGoal('player1');
            else { gameState.puck.x = WIDTH - PUCK_R; gameState.puck.vx *= -1; }
        }

        resolveCollision(gameState.puck, gameState.player1);
        resolveCollision(gameState.puck, gameState.player2);
    }
    io.emit('gameStateUpdate', gameState);
}, 20);

io.on('connection', (socket) => {
    socket.on('join', async (name) => {
        try {
            // --- ПОИСК ИЛИ СОЗДАНИЕ В MONGODB ---
            let user = await User.findOne({ name: name });
            if (!user) {
                user = new User({ name: name, rating: 1000 });
                await user.save();
                console.log(`✅ Новый игрок зарегистрирован: ${name}`);
            } else {
                console.log(`🔙 Игрок вернулся: ${name} (Рейтинг: ${user.rating})`);
            }
            // ------------------------------------

            if (!gameState.player1.id) {
                gameState.player1.id = socket.id; gameState.player1.name = name; 
                gameState.player1.rating = user.rating; socket.emit('role', 'p1');
            } else if (!gameState.player2.id) {
                gameState.player2.id = socket.id; gameState.player2.name = name; 
                gameState.player2.rating = user.rating; socket.emit('role', 'p2');
                gameState.paused = false;
            }
        } catch(e) { console.error("Ошибка входа:", e); }
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
