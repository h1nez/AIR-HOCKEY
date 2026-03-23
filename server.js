import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    transports: ["websocket"],
    pingInterval: 1000,
    pingTimeout: 3000 
});

// ==========================================
// 1. БАЗА ДАННЫХ MONGODB
// ==========================================
// ВСТАВЬ СВОЮ ССЫЛКУ СЮДА:
const MONGODB_URI = process.env.MONGODB_URI || 'ТВОЯ_ДЛИННАЯ_ССЫЛКА_ИЗ_ПРОШЛОГО_ШАГА';

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('✅ Успешное подключение к MongoDB!');
        const PORT = process.env.PORT || 10000;
        server.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
    })
    .catch(err => {
        console.error('❌ Критическая ошибка БД:', err.message);
        process.exit(1);
    });

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

// ==========================================
// 2. СИСТЕМА КОМНАТ (ROOMS)
// ==========================================
const rooms = {}; // Хранилище всех активных комнат
let roomCounter = 1;

// Функция создания новой комнаты
function createRoom() {
    const roomId = 'room_' + roomCounter++;
    rooms[roomId] = {
        id: roomId,
        puck: { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 },
        player1: { id: null, name: "...", x: 80, y: 200, score: 0, rating: 1000, speedX: 0, speedY: 0 },
        player2: { id: null, name: "...", x: 720, y: 200, score: 0, rating: 1000, speedX: 0, speedY: 0 },
        paused: true
    };
    return roomId;
}

function resolveCollision(puck, player) {
    const dx = puck.x - player.x;
    const dy = puck.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = PUCK_R + PLAYER_R;

    if (dist < minDist) {
        let nx = dx / dist; 
        let ny = dy / dist; 

        if (dist < 35) { 
            const oldX = player.x - player.speedX;
            const oldY = player.y - player.speedY;
            const oldDx = puck.x - oldX;
            const oldDy = puck.y - oldY;
            const oldDist = Math.sqrt(oldDx * oldDx + oldDy * oldDy);
            if (oldDist > 0) { nx = oldDx / oldDist; ny = oldDy / oldDist; }
        }

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

async function handleGoal(room, winRole) {
    room.paused = true;
    room.player1.x = 80; room.player1.y = 200;
    room.player2.x = 720; room.player2.y = 200;

    const win = winRole === 'player1' ? room.player1 : room.player2;
    const lose = winRole === 'player1' ? room.player2 : room.player1;
    win.score++;

    if (win.score >= 11) {
        const K = 32;
        const diff = Math.round(K * (1 - 1/(1+Math.pow(10,(lose.rating-win.rating)/400))));
        win.rating += diff; lose.rating -= diff;
        
        try {
            await User.findOneAndUpdate({ name: win.name }, { rating: win.rating });
            await User.findOneAndUpdate({ name: lose.name }, { rating: lose.rating });
        } catch (err) { console.error('Ошибка сохранения рейтинга:', err); }

        io.to(room.id).emit('goalNotify', { msg: `ЧЕМПИОН: ${win.name} (+${diff})`, color: "gold" });
        setTimeout(() => { room.player1.score = 0; room.player2.score = 0; reset(room); }, 5000);
    } else {
        io.to(room.id).emit('goalNotify', { msg: `ГОЛ: ${win.name}`, color: winRole === 'player1' ? '#4444ff' : '#ff4444' });
        setTimeout(() => reset(room), 2000);
    }
}

function reset(room) {
    room.puck = { x: WIDTH/2, y: HEIGHT/2, vx: 0, vy: 0 }; 
    room.player1.x = 80; room.player1.y = 200;
    room.player2.x = 720; room.player2.y = 200;
    room.paused = false;
    io.to(room.id).emit('goalNotify', { msg: "", color: "" });
}

// ==========================================
// 3. ГЛАВНЫЙ ЦИКЛ СЕРВЕРА (ОБРАБАТЫВАЕТ ВСЕ КОМНАТЫ)
// ==========================================
setInterval(() => {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        
        if (!room.paused) {
            room.puck.vx *= 0.995; room.puck.vy *= 0.995;
            room.puck.x += room.puck.vx; 
            room.puck.y += room.puck.vy;
            
            if (room.puck.y < PUCK_R) { room.puck.y = PUCK_R; room.puck.vy *= -1; }
            if (room.puck.y > HEIGHT - PUCK_R) { room.puck.y = HEIGHT - PUCK_R; room.puck.vy *= -1; }

            if (room.puck.x < PUCK_R) {
                if (room.puck.y > 125 && room.puck.y < 275) handleGoal(room, 'player2');
                else { room.puck.x = PUCK_R; room.puck.vx *= -1; }
            }
            if (room.puck.x > WIDTH - PUCK_R) {
                if (room.puck.y > 125 && room.puck.y < 275) handleGoal(room, 'player1');
                else { room.puck.x = WIDTH - PUCK_R; room.puck.vx *= -1; }
            }

            resolveCollision(room.puck, room.player1);
            resolveCollision(room.puck, room.player2);
        }
        // Отправляем данные только игрокам в этой конкретной комнате
        io.to(roomId).emit('gameStateUpdate', room);
    }
}, 20);

// ==========================================
// 4. ПОДКЛЮЧЕНИЕ ИГРОКОВ К КОМНАТАМ
// ==========================================
io.on('connection', (socket) => {
    socket.on('join', async (name) => {
        try {
            let user = await User.findOne({ name: name });
            if (!user) {
                user = new User({ name: name, rating: 1000 });
                await user.save();
            }

            let myRoomId = null;
            // Ищем комнату, где сидит только 1 игрок и ждет соперника
            for (const id in rooms) {
                if (rooms[id].player1.id && !rooms[id].player2.id) {
                    myRoomId = id; break;
                }
            }
            // Если свободных комнат нет — создаем новую
            if (!myRoomId) {
                myRoomId = createRoom();
            }

            const room = rooms[myRoomId];
            socket.join(myRoomId);       // Подключаем сокет к каналу связи комнаты
            socket.roomId = myRoomId;    // Запоминаем, в какой комнате игрок

            if (!room.player1.id) {
                room.player1.id = socket.id; room.player1.name = name; 
                room.player1.rating = user.rating; socket.emit('role', 'p1');
            } else if (!room.player2.id) {
                room.player2.id = socket.id; room.player2.name = name; 
                room.player2.rating = user.rating; socket.emit('role', 'p2');
                room.paused = false; // Начинаем матч!
            }
        } catch(e) { console.error("Ошибка входа:", e); }
    });

    socket.on('input', (data) => {
        if (!socket.roomId || !rooms[socket.roomId]) return; // Игнорируем, если нет комнаты
        const room = rooms[socket.roomId];

        const p = socket.id === room.player1.id ? room.player1 : (socket.id === room.player2.id ? room.player2 : null);
        if (p && !room.paused) {
            const oldX = p.x; const oldY = p.y;
            p.x = (p === room.player1) ? Math.min(365, Math.max(35, data.x)) : Math.min(765, Math.max(435, data.x));
            p.y = Math.min(365, Math.max(35, data.y));
            p.speedX = p.x - oldX; p.speedY = p.y - oldY;
        }
    });

    socket.on('disconnect', () => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        const room = rooms[socket.roomId];

        if (socket.id === room.player1.id) { room.player1.id = null; room.paused = true; }
        if (socket.id === room.player2.id) { room.player2.id = null; room.paused = true; }

        // Если из комнаты вышли ОБА игрока — удаляем её, чтобы не засорять память сервера
        if (!room.player1.id && !room.player2.id) {
            delete rooms[socket.roomId];
        }
    });
});