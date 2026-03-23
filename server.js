import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ==========================================
// 1. БАЗА ДАННЫХ MONGODB
// ==========================================
// 🛑 ВСТАВЬ СВОЮ ССЫЛКУ СЮДА:
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:davidik12@aerohockey.5bidt7s.mongodb.net/?appName=Aerohockey';

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
    password: { type: String, required: true },
    rating: { type: Number, default: 1000 },
    coins: { type: Number, default: 0 },
    skin: { type: String, default: 'default' },
    inventory: { type: [String], default: ['default'] }
});
const User = mongoose.model('User', userSchema);

// ==========================================
// 2. ИГРОВАЯ ЛОГИКА И КОМНАТЫ
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));

const WIDTH = 800; const HEIGHT = 400; const PUCK_R = 22; const PLAYER_R = 35;
const rooms = {}; let roomCounter = 1;

function createRoom() {
    const roomId = 'room_' + roomCounter++;
    rooms[roomId] = {
        id: roomId, puck: { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 },
        player1: { id: null, name: "...", skin: "default", x: 80, y: 200, score: 0, rating: 1000, speedX: 0, speedY: 0 },
        player2: { id: null, name: "...", skin: "default", x: 720, y: 200, score: 0, rating: 1000, speedX: 0, speedY: 0 },
        paused: true
    };
    return roomId;
}

function resolveCollision(puck, player) {
    const dx = puck.x - player.x; const dy = puck.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy); const minDist = PUCK_R + PLAYER_R;
    if (dist < minDist) {
        let nx = dx / dist; let ny = dy / dist; 
        if (dist < 35) { 
            const oldX = player.x - player.speedX; const oldY = player.y - player.speedY;
            const oldDx = puck.x - oldX; const oldDy = puck.y - oldY;
            const oldDist = Math.sqrt(oldDx * oldDx + oldDy * oldDy);
            if (oldDist > 0) { nx = oldDx / oldDist; ny = oldDy / oldDist; }
        }
        puck.x = player.x + nx * (minDist + 0.1); puck.y = player.y + ny * (minDist + 0.1);
        const relVX = puck.vx - player.speedX; const relVY = puck.vy - player.speedY;
        const velNormal = relVX * nx + relVY * ny;
        if (velNormal > 0) return;
        const res = 1.6; const impulse = -(1 + res) * velNormal;
        puck.vx += impulse * nx + (player.speedX * 0.8); puck.vy += impulse * ny + (player.speedY * 0.8);
        const maxSpeed = 28; const speed = Math.sqrt(puck.vx**2 + puck.vy**2);
        if (speed > maxSpeed) { puck.vx = (puck.vx / speed) * maxSpeed; puck.vy = (puck.vy / speed) * maxSpeed; }
    }
}

async function handleGoal(room, winRole) {
    room.paused = true;
    room.player1.x = 80; room.player1.y = 200; room.player2.x = 720; room.player2.y = 200;
    const win = winRole === 'player1' ? room.player1 : room.player2;
    const lose = winRole === 'player1' ? room.player2 : room.player1;
    win.score++;

    if (win.score >= 11) {
        const K = 32; const diff = Math.round(K * (1 - 1/(1+Math.pow(10,(lose.rating-win.rating)/400))));
        win.rating += diff; lose.rating -= diff;
        try {
            await User.findOneAndUpdate({ name: win.name }, { rating: win.rating, $inc: { coins: 25 } });
            await User.findOneAndUpdate({ name: lose.name }, { rating: lose.rating, $inc: { coins: 5 } });
        } catch (err) {}
        io.to(room.id).emit('goalNotify', { msg: `ЧЕМПИОН: ${win.name} (+${diff})`, color: "gold" });
        setTimeout(() => { room.player1.score = 0; room.player2.score = 0; reset(room); }, 5000);
    } else {
        io.to(room.id).emit('goalNotify', { msg: `ГОЛ: ${win.name}`, color: winRole === 'player1' ? '#4444ff' : '#ff4444' });
        setTimeout(() => reset(room), 2000);
    }
}

function reset(room) {
    room.puck = { x: WIDTH/2, y: HEIGHT/2, vx: 0, vy: 0 }; 
    room.player1.x = 80; room.player1.y = 200; room.player2.x = 720; room.player2.y = 200;
    room.paused = false;
    io.to(room.id).emit('goalNotify', { msg: "", color: "" });
}

setInterval(() => {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (!room.paused) {
            room.puck.vx *= 0.995; room.puck.vy *= 0.995;
            room.puck.x += room.puck.vx; room.puck.y += room.puck.vy;
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
            resolveCollision(room.puck, room.player1); resolveCollision(room.puck, room.player2);
        }
        io.to(roomId).emit('gameStateUpdate', room);
    }
}, 20);

// ==========================================
// 3. АВТОРИЗАЦИЯ И МЕНЮ
// ==========================================
function joinPlayerToRoom(socket, user) {
    // 🛑 ЗАЩИТА 1: Если игрок УЖЕ в комнате (двойной клик), прерываем функцию
    if (socket.roomId) return;

    let myRoomId = null;
    
    // 🛑 ЗАЩИТА 2: Ищем комнату, где свободно ЛЮБОЕ из двух мест
    for (const id in rooms) {
        if (!rooms[id].player1.id || !rooms[id].player2.id) { 
            myRoomId = id; break; 
        }
    }
    if (!myRoomId) myRoomId = createRoom();

    const room = rooms[myRoomId];
    socket.join(myRoomId);
    socket.roomId = myRoomId;

    // Сажаем на первое попавшееся свободное место
    if (!room.player1.id) {
        room.player1.id = socket.id; room.player1.name = user.name; 
        room.player1.rating = user.rating; room.player1.skin = user.skin; socket.emit('role', 'p1');
    } else if (!room.player2.id) {
        room.player2.id = socket.id; room.player2.name = user.name; 
        room.player2.rating = user.rating; room.player2.skin = user.skin; socket.emit('role', 'p2');
        room.paused = false; 
    }
}

io.on('connection', (socket) => {
    
    socket.on('register', async (data, callback) => {
        try {
            if (!data.name || !data.password) return callback({ success: false, msg: "Заполните все поля!" });
            const existing = await User.findOne({ name: data.name });
            if (existing) return callback({ success: false, msg: "Это имя уже занято!" });

            const hashedPassword = await bcrypt.hash(data.password, 10);
            const newUser = new User({ name: data.name, password: hashedPassword });
            await newUser.save();

            socket.user = newUser; 
            callback({ success: true });
        } catch(e) { callback({ success: false, msg: "Ошибка сервера" }); }
    });

    socket.on('login', async (data, callback) => {
        try {
            if (!data.name || !data.password) return callback({ success: false, msg: "Заполните все поля!" });
            const user = await User.findOne({ name: data.name });
            if (!user) return callback({ success: false, msg: "Аккаунт не найден!" });

            const isMatch = await bcrypt.compare(data.password, user.password);
            if (!isMatch) return callback({ success: false, msg: "Неверный пароль!" });

            socket.user = user; 
            callback({ success: true });
        } catch(e) { callback({ success: false, msg: "Ошибка сервера" }); }
    });

    // 🛑 ЗАЩИТА 3: Проверяем, не забыл ли сервер юзера после разрыва связи
    socket.on('play', () => { 
        if (socket.user) {
            joinPlayerToRoom(socket, socket.user); 
        } else {
            // Если забыл — отправляем команду перезагрузить страницу
            socket.emit('forceReload');
        }
    });

    socket.on('cancelPlay', () => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        const room = rooms[socket.roomId];
        
        // Безопасно очищаем именно того игрока, который отменил
        if (room.player1.id === socket.id) room.player1.id = null;
        if (room.player2.id === socket.id) room.player2.id = null;
        
        // Если комната опустела - удаляем
        if (!room.player1.id && !room.player2.id) {
            delete rooms[socket.roomId]; 
        }
        socket.leave(socket.roomId); 
        socket.roomId = null; 
    });

    socket.on('getProfile', async (callback) => {
        if (!socket.user) return;
        const u = await User.findById(socket.user._id);
        socket.user = u; 
        callback({ success: true, coins: u.coins, skin: u.skin, inventory: u.inventory });
    });

    socket.on('buySkin', async (skinName, callback) => {
        if (!socket.user) return;
        const prices = { korzhik: 50, karamelka: 50, kompot: 50, default: 0 };
        const u = await User.findById(socket.user._id);
        
        if (u.inventory.includes(skinName)) {
            u.skin = skinName;
            await u.save();
            socket.user = u;
            return callback({ success: true, coins: u.coins, skin: u.skin, inventory: u.inventory });
        }

        if (u.coins >= prices[skinName]) {
            u.coins -= prices[skinName];
            u.inventory.push(skinName);
            u.skin = skinName;
            await u.save();
            socket.user = u;
            return callback({ success: true, coins: u.coins, skin: u.skin, inventory: u.inventory });
        } else {
            return callback({ success: false, msg: "Не хватает монет!" });
        }
    });

    socket.on('getLeaderboard', async (callback) => {
        try {
            const topUsers = await User.find().sort({ rating: -1 }).limit(10).select('name rating -_id');
            callback({ success: true, leaderboard: topUsers });
        } catch(e) { callback({ success: false }); }
    });

    socket.on('input', (data) => {
        if (!socket.roomId || !rooms[socket.roomId]) return; 
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
        if (!room.player1.id && !room.player2.id) delete rooms[socket.roomId];
    });
});