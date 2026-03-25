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
// 1. НАСТРОЙКИ И БАЗА ДАННЫХ
// ==========================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:davidik12@aerohockey.5bidt7s.mongodb.net/';
const ADMIN_NICKNAME = "davidik12"; 

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => { console.error('❌ DB Error:', err.message); process.exit(1); });

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    rating: { type: Number, default: 1000 },
    maxRating: { type: Number, default: 1000 },
    minRating: { type: Number, default: 1000 },
    coins: { type: Number, default: 0 },
    skin: { type: String, default: 'default' },
    inventory: { type: [String], default: ['default'] },
    friends: { type: [String], default: [] },
    requests: { type: [String], default: [] },
    gamesPlayed: { type: Number, default: 0 },
    gamesWon: { type: Number, default: 0 },
    regDate: { type: Date, default: Date.now },
    avatar: { type: String, default: 'avatar1' },
    regIp: { type: String, default: 'Скрыт' },
    clan: { type: String, default: null },
    clanInvites: { type: [String], default: [] },
    title: { type: String, default: '' },
    bpLevel: { type: Number, default: 0 },
    bpXP: { type: Number, default: 0 },
    goalEffects: { type: [String], default: ['default'] },
    currentGoalEffect: { type: String, default: 'default' },
    vsCases: { type: Number, default: 1 },
    vsEffects: { type: [String], default: ['none'] },
    currentVsEffect: { type: String, default: 'none' }
});
const User = mongoose.model('User', userSchema);

const clanSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    maxMembers: { type: Number, default: 30 },
    isPrivate: { type: Boolean, default: false },
    leader: { type: String, required: true },
    deputies: { type: [String], default: [] },
    members: { type: [String], default: [] },
    chat: { type: Array, default: [] }
});
const Clan = mongoose.model('Clan', clanSchema);

const connectedUsers = {}; 

// ==========================================
// 2. ГЕЙМПЛЕЙНЫЕ КОНСТАНТЫ И КОМНАТЫ
// ==========================================
const WIDTH = 800; const HEIGHT = 400; const PUCK_R = 22;
const rooms = {}; let roomCounter = 1;

let tourney = { state: 'idle', players: [], winners: [], matchesActive: 0, round: 1 };

function createRoom(isBotMatch = false, isFriendly = false, isTournament = false) {
    const roomId = 'room_' + roomCounter++;
    rooms[roomId] = {
        id: roomId, puck: { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 },
        player1: { id: null, ip: null, name: "...", skin: "default", x: 80, y: 200, score: 0, rating: 1000, speedX: 0, speedY: 0, avatar: "avatar1", title: "", effect: "default", vsEffect: "none" },
        player2: { id: null, ip: null, name: "...", skin: "default", x: 720, y: 200, score: 0, rating: 1000, speedX: 0, speedY: 0, avatar: "avatar1", title: "", effect: "default", vsEffect: "none" },
        paused: true, gameOver: false, rematch: { player1: false, player2: false },
        disconnectTimeout: null, reconnectDeadline: null, timeLeft: null,
        botTimer: null, isBotMatch, isFriendly, isTournament
    };
    return roomId;
}

// РЕАЛЬНАЯ ФИЗИКА (БЕЗ СОКРАЩЕНИЙ)
function resolveCollision(puck, player) {
    let pR = 35; let res = 1.6; let pMaxSpeed = 28; 
    if (player.skin === 'kompot') pR = 43; 
    if (player.skin === 'gonya') pR = 28; 
    if (player.skin === 'korzhik') res = 1.9; 
    if (player.skin === 'gonya') res = 2.2; 
    if (player.skin === 'karamelka') pMaxSpeed = 35; 
    if (player.skin === 'sazhik') { pR = 35; res = 2.0; pMaxSpeed = 32; } 

    const dx = puck.x - player.x; const dy = puck.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy); const minDist = PUCK_R + pR;
    
    if (dist < minDist) {
        let nx = dx / dist; let ny = dy / dist; 
        if (dist < pR) { 
            const oldX = player.x - player.speedX; const oldY = player.y - player.speedY;
            const oldDx = puck.x - oldX; const oldDy = puck.y - oldY;
            const oldDist = Math.sqrt(oldDx * oldDx + oldDy * oldDy);
            if (oldDist > 0) { nx = oldDx / oldDist; ny = oldDy / oldDist; }
        }
        puck.x = player.x + nx * (minDist + 0.1); puck.y = player.y + ny * (minDist + 0.1);
        const relVX = puck.vx - player.speedX; const relVY = puck.vy - player.speedY;
        const velNormal = relVX * nx + relVY * ny;
        if (velNormal > 0) return;
        const impulse = -(1 + res) * velNormal;
        puck.vx += impulse * nx + (player.speedX * 0.8); puck.vy += impulse * ny + (player.speedY * 0.8);
        const speed = Math.sqrt(puck.vx**2 + puck.vy**2);
        if (speed > pMaxSpeed) { puck.vx = (puck.vx / speed) * pMaxSpeed; puck.vy = (puck.vy / speed) * pMaxSpeed; }
    }
}
// ==========================================
// 3. СИСТЕМА ОПЫТА И ПРОГРЕССИИ (BP)
// ==========================================
async function applyBP(userName, xpAdded, socketId) {
    if (userName === "..." || userName.includes("Бот")) return;
    try {
        const userDoc = await User.findOne({ name: userName });
        if (!userDoc) return;
        
        userDoc.bpXP += xpAdded;
        let leveledUp = false;
        let rewards = [];

        // Логика повышения уровней (макс 30)
        while (userDoc.bpXP >= 100 && userDoc.bpLevel < 30) {
            userDoc.bpXP -= 100;
            userDoc.bpLevel++;
            leveledUp = true;
            
            // Награды за уровни
            if (userDoc.bpLevel === 10) { 
                if (!userDoc.goalEffects.includes('fire')) userDoc.goalEffects.push('fire'); 
                rewards.push('Эффект Гола: Огонь 🔥'); 
            } else if (userDoc.bpLevel === 20) { 
                if (!userDoc.goalEffects.includes('blackhole')) userDoc.goalEffects.push('blackhole'); 
                rewards.push('Эффект Гола: Черная дыра 🌌'); 
            } else if (userDoc.bpLevel === 25) { 
                userDoc.vsCases = (userDoc.vsCases || 0) + 1; 
                rewards.push('Кейс Аватарок (VS) 🎁'); 
            } else if (userDoc.bpLevel === 30) { 
                if (!userDoc.goalEffects.includes('ice')) userDoc.goalEffects.push('ice'); 
                rewards.push('Эффект Гола: Лед ❄️ + Доступ к Темному Рынку!'); 
            } else { 
                userDoc.coins += 50; 
                rewards.push('50 Монет 💰'); 
            }
        }
        
        await userDoc.save();
        if (leveledUp && socketId) {
            io.to(socketId).emit('bpLevelUp', { level: userDoc.bpLevel, rewards });
        }
    } catch(e) { console.error("Ошибка BP:", e); }
}

// ==========================================
// 4. ЗАВЕРШЕНИЕ МАТЧА И РЕЗУЛЬТАТЫ
// ==========================================
async function finishMatch(room, winRole, isDisconnect = false) {
    if (room.gameOver) return; // Защита от двойного вызова
    room.paused = true;
    room.gameOver = true;
    
    if (room.botTimer) clearTimeout(room.botTimer);
    if (room.disconnectTimeout) clearTimeout(room.disconnectTimeout);

    const win = winRole === 'player1' ? room.player1 : room.player2;
    const lose = winRole === 'player1' ? room.player2 : room.player1;

    if (lose.name === "...") return; 
    if (isDisconnect) win.score = 5; 

    // --- ЛОГИКА ТУРНИРА ---
    if (room.isTournament) {
        tourney.matchesActive--;
        // Победитель проходит дальше
        if (win.id && !win.id.includes('bot')) {
            tourney.winners.push(win.name);
            const winnerSid = connectedUsers[win.name];
            if (winnerSid) io.to(winnerSid).emit('tourneyMsg', `Поздравляем! Вы прошли в следующий раунд.`);
        }
        
        io.to(room.id).emit('goalNotify', { 
            msg: `ТУРНИР: ПОБЕДА ${win.name}!`, 
            color: "gold", 
            effectType: win.effect 
        });
        
        setTimeout(() => io.to(room.id).emit('showEndScreen'), 2500);
        
        // Если это был последний матч в раунде — запускаем следующий раунд
        if (tourney.matchesActive <= 0) {
            setTimeout(() => startNextTournamentRound(), 3000);
        }
        return;
    }

    // --- ОБЫЧНЫЙ МАТЧ (Опыт, ЭЛО, Монеты) ---
    if (!room.isFriendly && !room.isBotMatch) {
        // Начисляем опыт BP
        if (win.id && !win.id.includes('bot')) await applyBP(win.name, 50, win.id);
        if (lose.id && !lose.id.includes('bot')) await applyBP(lose.name, 20, lose.id);

        // Расчет рейтинга ЭЛО
        const K = 32;
        const expectedWin = 1 / (1 + Math.pow(10, (lose.rating - win.rating) / 400));
        const ratingDiff = Math.round(K * (1 - expectedWin));

        win.rating += ratingDiff;
        lose.rating -= ratingDiff;

        // Сохранение в БД
        try {
            const winnerDoc = await User.findOne({ name: win.name });
            if (winnerDoc) {
                winnerDoc.rating = win.rating;
                winnerDoc.coins += 25;
                winnerDoc.gamesPlayed += 1;
                winnerDoc.gamesWon += 1;
                if (win.rating > winnerDoc.maxRating) winnerDoc.maxRating = win.rating;
                await winnerDoc.save();
            }

            const loserDoc = await User.findOne({ name: lose.name });
            if (loserDoc) {
                loserDoc.rating = lose.rating;
                loserDoc.coins += 5;
                loserDoc.gamesPlayed += 1;
                if (lose.rating < loserDoc.minRating) loserDoc.minRating = lose.rating;
                await loserDoc.save();
            }
        } catch (err) { console.error("Ошибка сохранения итогов:", err); }

        io.to(room.id).emit('goalNotify', { 
            msg: `ЧЕМПИОН: ${win.name} (+${ratingDiff})`, 
            color: "gold", 
            effectType: win.effect 
        });
    } else {
        // Дружеский матч или бот
        const msg = isDisconnect ? "ОППОНЕНТ ВЫШЕЛ" : `ПОБЕДА: ${win.name}! 🎉`;
        io.to(room.id).emit('goalNotify', { msg, color: "gold", effectType: win.effect });
    }

    setTimeout(() => io.to(room.id).emit('showEndScreen'), 2000);
}

// ==========================================
// 5. ПОДБОР ИГРОКОВ И СОЗДАНИЕ ПАР
// ==========================================
function joinPlayerToRoom(socket, user) {
    if (socket.roomId) return;

    let targetRoomId = null;
    let rawIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || "";
    let clientIp = rawIp.split(',')[0].trim();

    // Ищем подходящую комнату
    for (const id in rooms) {
        const r = rooms[id];
        if (r.gameOver || r.isBotMatch || r.isFriendly || r.isTournament) continue;
        
        // Проверка: не играть с самим собой по IP
        if (r.player1.id && r.player1.ip === clientIp) continue;
        
        // Если в комнате есть один игрок и место свободно
        if (r.player1.id && !r.player2.id && r.player2.name === "...") {
            targetRoomId = id;
            break;
        }
    }

    if (!targetRoomId) targetRoomId = createRoom(false, false, false);
    const room = rooms[targetRoomId];
    socket.join(targetRoomId);
    socket.roomId = targetRoomId;

    if (!room.player1.id) {
        // Садим первого игрока
        room.player1.id = socket.id;
        room.player1.ip = clientIp;
        room.player1.name = user.name;
        room.player1.rating = user.rating;
        room.player1.skin = user.skin;
        room.player1.avatar = user.avatar;
        room.player1.title = user.title;
        room.player1.effect = user.currentGoalEffect || 'default';
        room.player1.vsEffect = user.currentVsEffect || 'none';
        socket.emit('role', 'p1');

        // Запуск таймера секретного бота (15 сек)
        room.botTimer = setTimeout(() => {
            if (room.player1.id && !room.player2.id) {
                spawnSecretBot(room);
            }
        }, 15000);

    } else {
        // Садим второго игрока (матч начинается)
        room.player2.id = socket.id;
        room.player2.ip = clientIp;
        room.player2.name = user.name;
        room.player2.rating = user.rating;
        room.player2.skin = user.skin;
        room.player2.avatar = user.avatar;
        room.player2.title = user.title;
        room.player2.effect = user.currentGoalEffect || 'default';
        room.player2.vsEffect = user.currentVsEffect || 'none';
        socket.emit('role', 'p2');

        if (room.botTimer) clearTimeout(room.botTimer);
        
        room.paused = true;
        io.to(targetRoomId).emit('showVsScreen', { p1: room.player1, p2: room.player2 });
        setTimeout(() => { if (rooms[targetRoomId]) rooms[targetRoomId].paused = false; }, 3000);
    }
}

function spawnSecretBot(room) {
    const names = ['s1mple', 'donk', 'Ghoul', 'Hokage', 'Pudge', 'CyberCat', 'Neo'];
    const skins = ['default', 'korzhik', 'karamelka', 'kompot', 'gonya'];
    
    room.player2.id = 'secret_bot';
    room.player2.name = names[Math.floor(Math.random() * names.length)];
    room.player2.skin = skins[Math.floor(Math.random() * skins.length)];
    room.player2.rating = room.player1.rating + (Math.floor(Math.random() * 40) - 20);
    room.player2.avatar = 'avatar' + (Math.floor(Math.random() * 4) + 1);
    room.player2.vsEffect = Math.random() > 0.5 ? 'neon' : 'none';
    
    room.paused = true;
    io.to(room.id).emit('showVsScreen', { p1: room.player1, p2: room.player2 });
    setTimeout(() => { if (rooms[room.id]) rooms[room.id].paused = false; }, 3000);
}

// ==========================================
// 6. АВТОМАТИЗАЦИЯ ТУРНИРНОЙ СЕТКИ
// ==========================================
async function startNextTournamentRound() {
    // Победители прошлого раунда становятся участниками текущего
    tourney.players = [...tourney.winners];
    tourney.winners = [];

    // --- ФИНАЛ: Остался только один чемпион ---
    if (tourney.players.length === 1) {
        const championName = tourney.players[0];
        tourney.state = 'idle';
        
        io.emit('tourneyAnnounce', { 
            type: 'end', 
            msg: `🏆 ТУРНИР ЗАВЕРШЕН! Чемпион: ${championName}!` 
        });

        try {
            const u = await User.findOne({ name: championName });
            if (u) {
                u.title = "Чемпион Недели 🏆";
                u.coins += 1000;
                await u.save();
                
                const sId = connectedUsers[championName];
                if (sId) io.to(sId).emit('tourneyMsg', '🎉 ВЫ ВЫИГРАЛИ ТУРНИР! Вам выдан уникальный титул и 1000 монет!');
            }
        } catch(e) { console.error("Ошибка награждения чемпиона:", e); }
        
        resetTourney();
        return;
    }

    // Если вдруг игроков не осталось (все вышли)
    if (tourney.players.length === 0) {
        resetTourney();
        return;
    }

    // --- ГЕНЕРАЦИЯ ПАР ---
    tourney.round++;
    let shuffled = tourney.players.sort(() => 0.5 - Math.random());
    tourney.matchesActive = 0;

    for (let i = 0; i < shuffled.length; i += 2) {
        if (i + 1 < shuffled.length) {
            // Есть пара — создаем матч
            await setupTournamentMatch(shuffled[i], shuffled[i+1]);
        } else {
            // Игроку не хватило пары — он проходит автоматически (Bye)
            tourney.winners.push(shuffled[i]);
            const sId = connectedUsers[shuffled[i]];
            if (sId) io.to(sId).emit('tourneyMsg', `Вам не досталось противника в этом раунде. Вы автоматически проходите дальше!`);
        }
    }
    
    // Если все матчи были "авто-проходами" (редкий случай), запускаем некст раунд
    if (tourney.matchesActive === 0 && tourney.winners.length > 0) {
        startNextTournamentRound();
    }
}

async function setupTournamentMatch(p1Name, p2Name) {
    const sId1 = connectedUsers[p1Name];
    const sId2 = connectedUsers[p2Name];

    // Если оба оффлайн — никто не проходит
    if (!sId1 && !sId2) return; 
    
    // Если один оффлайн — второй проходит автоматом
    if (!sId1) { tourney.winners.push(p2Name); return; }
    if (!sId2) { tourney.winners.push(p1Name); return; }

    try {
        const u1 = await User.findOne({ name: p1Name }).lean();
        const u2 = await User.findOne({ name: p2Name }).lean();
        
        const roomId = createRoom(false, false, true); // Флаг турнира = true
        const room = rooms[roomId];
        
        // Перекидываем сокеты игроков в новую комнату
        const sock1 = io.sockets.sockets.get(sId1);
        const sock2 = io.sockets.sockets.get(sId2);
        
        if (sock1) { 
            sock1.leave(sock1.roomId); 
            sock1.join(roomId); 
            sock1.roomId = roomId; 
            sock1.emit('role', 'p1'); 
            sock1.emit('forceStartGame'); 
        }
        if (sock2) { 
            sock2.leave(sock2.roomId); 
            sock2.join(roomId); 
            sock2.roomId = roomId; 
            sock2.emit('role', 'p2'); 
            sock2.emit('forceStartGame'); 
        }

        room.player1 = { id: sId1, name: u1.name, skin: u1.skin, x: 80, y: 200, score: 0, rating: u1.rating, avatar: u1.avatar, title: u1.title, effect: u1.currentGoalEffect };
        room.player2 = { id: sId2, name: u2.name, skin: u2.skin, x: 720, y: 200, score: 0, rating: u2.rating, avatar: u2.avatar, title: u2.title, effect: u2.currentGoalEffect };
        
        tourney.matchesActive++;
        room.paused = true;
        
        io.to(roomId).emit('showVsScreen', { p1: room.player1, p2: room.player2 }); 
        setTimeout(() => { if (rooms[roomId]) rooms[roomId].paused = false; }, 4000);
        
    } catch(e) { console.error("Ошибка создания турнирного матча:", e); }
}

// ==========================================
// 7. ГЛАВНЫЙ ИГРОВОЙ ЦИКЛ (20 FPS)
// ==========================================
setInterval(() => {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        
        // Логика реконнекта (таймер на экране)
        if (room.reconnectDeadline) {
            room.timeLeft = Math.max(0, Math.ceil((room.reconnectDeadline - Date.now()) / 1000));
        }
        
        if (!room.paused && !room.gameOver) {
            // --- ЛОГИКА БОТА (Тайная или Обычная тренировка) ---
            if (room.player2.id === 'bot' || room.player2.id === 'secret_bot') {
                const bot = room.player2; 
                const puck = room.puck;
                const oldX = bot.x; 
                const oldY = bot.y;
                
                let targetY = puck.y; 
                let targetX = 720; 

                // Если шайба на стороне бота
                if (puck.x > 400) {
                    if (puck.x > bot.x) { targetX = 760; targetY = 200; } 
                    else { targetX = puck.x + 25; }
                }
                
                const speed = room.player2.id === 'secret_bot' ? 7.8 : 6.2; 
                if (bot.y < targetY - speed) bot.y += speed; else if (bot.y > targetY + speed) bot.y -= speed;
                if (bot.x < targetX - speed) bot.x += speed; else if (bot.x > targetX + speed) bot.x -= speed;

                bot.x = Math.max(435, Math.min(765, bot.x));
                bot.y = Math.max(35, Math.min(365, bot.y));
                bot.speedX = bot.x - oldX; bot.speedY = bot.y - oldY;
            }

            // --- ФИЗИКА ШАЙБЫ ---
            room.puck.vx *= 0.995; room.puck.vy *= 0.995; 
            room.puck.x += room.puck.vx; 
            room.puck.y += room.puck.vy;

            // Отскоки от стен (верх/низ)
            if (room.puck.y < PUCK_R) { room.puck.y = PUCK_R; room.puck.vy *= -1; }
            if (room.puck.y > HEIGHT - PUCK_R) { room.puck.y = HEIGHT - PUCK_R; room.puck.vy *= -1; }

            // Ворота / Стенки (слева)
            if (room.puck.x < PUCK_R) {
                if (room.puck.y > 125 && room.puck.y < 275) handleGoal(room, 'player2');
                else { room.puck.x = PUCK_R; room.puck.vx *= -1; }
            }
            // Ворота / Стенки (справа)
            if (room.puck.x > WIDTH - PUCK_R) {
                if (room.puck.y > 125 && room.puck.y < 275) handleGoal(room, 'player1');
                else { room.puck.x = WIDTH - PUCK_R; room.puck.vx *= -1; }
            }

            // Столкновения с игроками
            resolveCollision(room.puck, room.player1);
            resolveCollision(room.puck, room.player2);
        }

        // Рассылка состояния комнаты всем участникам (и зрителям)
        io.to(roomId).emit('gameStateUpdate', {
            puck: room.puck,
            player1: room.player1,
            player2: room.player2,
            paused: room.paused,
            gameOver: room.gameOver,
            timeLeft: room.timeLeft
        });
    }
}, 20);

// ==========================================
// 8. ОБРАБОТКА ПОДКЛЮЧЕНИЙ (SOCKETS)
// ==========================================
io.on('connection', (socket) => {

    // --- АВТОРИЗАЦИЯ ---
    socket.on('login', async (data, callback) => {
        try {
            if (!data.name || !data.password) return callback({ success: false, msg: "Заполните поля!" });
            const user = await User.findOne({ name: data.name });
            if (!user) return callback({ success: false, msg: "Аккаунт не найден" });
            
            const isMatch = await bcrypt.compare(data.password, user.password);
            if (!isMatch) return callback({ success: false, msg: "Неверный пароль" });

            socket.user = user;
            connectedUsers[user.name] = socket.id;
            
            // Проверка на реконнект
            if (tryRejoin(socket, user)) {
                callback({ success: true, rejoining: true });
            } else {
                callback({ success: true, rejoining: false });
            }
        } catch(e) { callback({ success: false, msg: "Ошибка сервера" }); }
    });

    socket.on('register', async (data, callback) => {
        try {
            if (!data.name || !data.password) return callback({ success: false, msg: "Заполните поля!" });
            if (data.name.length < 3) return callback({ success: false, msg: "Ник слишком короткий" });
            
            const existing = await User.findOne({ name: data.name });
            if (existing) return callback({ success: false, msg: "Ник уже занят" });

            const hashedPassword = await bcrypt.hash(data.password, 10);
            const newUser = new User({ 
                name: data.name, 
                password: hashedPassword,
                regIp: socket.handshake.address 
            });
            
            await newUser.save();
            socket.user = newUser;
            connectedUsers[newUser.name] = socket.id;
            
            callback({ success: true, rejoining: false });
        } catch(e) { callback({ success: false, msg: "Ошибка регистрации" }); }
    });
	
// ==========================================
    // 9. ПРОФИЛЬ И МАГАЗИН (ИНВЕНТАРЬ)
    // ==========================================
    socket.on('getProfile', async (callback) => {
        if (!socket.user) return;
        try {
            const u = await User.findById(socket.user._id);
            socket.user = u; 
            callback({ 
                success: true, 
                coins: u.coins, skin: u.skin, inventory: u.inventory, 
                reqCount: u.requests.length, isAdmin: u.name === ADMIN_NICKNAME,
                clanName: u.clan, title: u.title, bpLevel: u.bpLevel, bpXP: u.bpXP,
                goalEffects: u.goalEffects, currentGoalEffect: u.currentGoalEffect,
                vsCases: u.vsCases, vsEffects: u.vsEffects, currentVsEffect: u.currentVsEffect
            });
        } catch(e) { callback({ success: false }); }
    });

    socket.on('buySkin', async (skinName, callback) => {
        if (!socket.user) return;
        const prices = { korzhik: 250, karamelka: 250, kompot: 500, gonya: 500, default: 0 };
        try {
            const u = await User.findById(socket.user._id);
            if (u.inventory.includes(skinName)) {
                u.skin = skinName;
                await u.save();
                return callback({ success: true, coins: u.coins, skin: u.skin });
            }
            if (u.coins >= prices[skinName]) {
                u.coins -= prices[skinName];
                u.inventory.push(skinName);
                u.skin = skinName;
                await u.save();
                callback({ success: true, coins: u.coins, skin: u.skin });
            } else {
                callback({ success: false, msg: "Недостаточно монет!" });
            }
        } catch(e) { callback({ success: false }); }
    });

    socket.on('buyBpItem', async (item, callback) => {
        if (!socket.user) return;
        try {
            const u = await User.findById(socket.user._id);
            if (u.bpLevel < 30) return callback({ success: false, msg: "Нужен 30 уровень БП!" });
            
            if (item === 'sazhik') {
                if (u.inventory.includes('sazhik')) return callback({ success: false, msg: "Уже куплено" });
                if (u.bpXP < 1500) return callback({ success: false, msg: "Недостаточно XP (1500)" });
                u.bpXP -= 1500; u.inventory.push('sazhik');
            } else if (item === 'matrix') {
                if (u.vsEffects.includes('matrix')) return callback({ success: false, msg: "Уже куплено" });
                if (u.bpXP < 800) return callback({ success: false, msg: "Недостаточно XP (800)" });
                u.bpXP -= 800; u.vsEffects.push('matrix');
            }
            await u.save();
            callback({ success: true, msg: "Успешно приобретено!" });
        } catch(e) { callback({ success: false }); }
    });

    // ==========================================
    // 10. СИСТЕМА КЛАНОВ (ПОЛНАЯ)
    // ==========================================
    socket.on('createClan', async (data, callback) => {
        if (!socket.user) return;
        try {
            const u = await User.findById(socket.user._id);
            if (u.clan) return callback({ success: false, msg: "Вы уже в клане!" });
            if (await Clan.findOne({ name: data.name })) return callback({ success: false, msg: "Имя занято" });
            
            const newClan = new Clan({
                name: data.name,
                leader: u.name,
                members: [u.name],
                isPrivate: data.isPrivate
            });
            await newClan.save();
            u.clan = newClan.name;
            await u.save();
            callback({ success: true, msg: "Клан создан!" });
        } catch(e) { callback({ success: false }); }
    });

    socket.on('sendClanChat', async (msg) => {
        if (!socket.user || !socket.user.clan) return;
        try {
            const clan = await Clan.findOne({ name: socket.user.clan });
            const chatMsg = { name: socket.user.name, msg: msg.substring(0, 100), time: Date.now() };
            clan.chat.push(chatMsg);
            if (clan.chat.length > 50) clan.chat.shift();
            await clan.save();
            clan.members.forEach(m => {
                const sId = connectedUsers[m];
                if (sId) io.to(sId).emit('newClanMsg', chatMsg);
            });
        } catch(e) {}
    });

    socket.on('clanAction', async (data, callback) => {
        if (!socket.user || !socket.user.clan) return;
        try {
            const clan = await Clan.findOne({ name: socket.user.clan });
            if (clan.leader !== socket.user.name) return callback({ success: false, msg: "Нет прав" });
            
            if (data.action === 'kick') {
                clan.members = clan.members.filter(m => m !== data.targetName);
                const target = await User.findOne({ name: data.targetName });
                if (target) { target.clan = null; await target.save(); }
            }
            await clan.save();
            callback({ success: true });
        } catch(e) { callback({ success: false }); }
    });

    // ==========================================
    // 11. ДРУЗЬЯ И СОЦИАЛКА
    // ==========================================
    socket.on('searchUser', async (query, callback) => {
        try {
            const users = await User.find({ name: new RegExp(query, 'i') }).limit(5).select('name rating');
            callback({ success: true, users });
        } catch(e) { callback({ success: false }); }
    });

    socket.on('sendGift', async (data, callback) => {
        if (!socket.user || data.amount <= 0) return;
        try {
            const sender = await User.findById(socket.user._id);
            const target = await User.findOne({ name: data.targetName });
            if (sender.coins < data.amount) return callback({ success: false, msg: "Мало монет" });
            
            sender.coins -= Number(data.amount);
            target.coins += Number(data.amount);
            await sender.save(); await target.save();
            callback({ success: true, msg: "Подарок отправлен!" });
        } catch(e) { callback({ success: false }); }
    });

    // ==========================================
    // 12. АДМИН-ПАНЕЛЬ И ТУРНИРЫ
    // ==========================================
    socket.on('adminGetUsers', async (callback) => {
        if (socket.user?.name !== ADMIN_NICKNAME) return;
        try {
            const users = await User.find().select('name rating coins regIp clan').lean();
            callback({ success: true, users, tourneyState: tourney.state, tourneyPlayers: tourney.players.length });
        } catch(e) { callback({ success: false }); }
    });

    socket.on('tourneyAdminAction', (action, callback) => {
        if (socket.user?.name !== ADMIN_NICKNAME) return;
        if (action === 'startReg') {
            tourney.state = 'reg'; tourney.players = []; tourney.winners = [];
            io.emit('tourneyAnnounce', { type: 'reg', msg: "🏆 РЕГИСТРАЦИЯ НА ТУРНИР ОТКРЫТА!" });
        } else if (action === 'startMatches') {
            if (tourney.players.length < 2) return callback({ success: false, msg: "Мало игроков" });
            tourney.state = 'playing';
            startNextTournamentRound();
        } else if (action === 'cancel') {
            tourney.state = 'idle'; resetTourney();
            io.emit('tourneyAnnounce', { type: 'cancel', msg: "❌ Турнир отменен" });
        }
        callback({ success: true });
    });

    socket.on('adminAction', async (data, callback) => {
        if (socket.user?.name !== ADMIN_NICKNAME) return;
        try {
            const t = await User.findOne({ name: data.targetName });
            if (data.action === 'ban') {
                await User.deleteOne({ name: data.targetName });
                const tid = connectedUsers[data.targetName];
                if (tid) io.to(tid).emit('forceReload');
            } else if (data.action === 'addCoins') {
                t.coins += Number(data.amount); await t.save();
            }
            callback({ success: true, msg: "Выполнено" });
        } catch(e) { callback({ success: false }); }
    });

    // ==========================================
    // 13. ГЕЙМПЛЕЙНЫЕ СОКЕТЫ (ВВОД И ВЫХОД)
    // ==========================================
    socket.on('play', () => { if (socket.user) joinPlayerToRoom(socket, socket.user); });

    socket.on('input', (data) => {
        const room = rooms[socket.roomId];
        if (!room || room.paused || room.gameOver) return;
        const p = socket.id === room.player1.id ? room.player1 : (socket.id === room.player2.id ? room.player2 : null);
        if (p) {
            const oldX = p.x, oldY = p.y;
            let rad = p.skin === 'kompot' ? 43 : (p.skin === 'gonya' ? 28 : 35);
            if (p.skin === 'sazhik') rad = 35;
            
            let minX = p === room.player1 ? rad : 400 + rad;
            let maxX = p === room.player1 ? 400 - rad : 800 - rad;
            
            p.x = Math.min(maxX, Math.max(minX, data.x));
            p.y = Math.min(400 - rad, Math.max(rad, data.y));
            p.speedX = p.x - oldX; p.speedY = p.y - oldY;
        }
    });

    socket.on('rematch', () => {
        const room = rooms[socket.roomId];
        if (!room || room.isTournament) return;
        if (socket.id === room.player1.id) room.rematch.player1 = true;
        if (socket.id === room.player2.id) room.rematch.player2 = true;
        
        if (room.rematch.player1 && room.rematch.player2) {
            room.player1.score = 0; room.player2.score = 0;
            room.gameOver = false; room.paused = true;
            room.puck = { x: 400, y: 200, vx: 0, vy: 0 };
            io.to(room.id).emit('hideEndScreen');
            io.to(room.id).emit('showVsScreen', { p1: room.player1, p2: room.player2 });
            setTimeout(() => { if (rooms[room.id]) rooms[room.id].paused = false; }, 3000);
        }
    });

    socket.on('leaveMatch', () => {
        const room = rooms[socket.roomId];
        if (room && !room.gameOver) finishMatch(room, socket.id === room.player1.id ? 'player2' : 'player1', true);
        socket.leave(socket.roomId);
        socket.roomId = null;
    });

    socket.on('disconnect', () => {
        if (socket.user) delete connectedUsers[socket.user.name];
        const room = rooms[socket.roomId];
        if (room && !room.gameOver) {
            const role = socket.id === room.player1.id ? 'player1' : 'player2';
            room[role].id = null;
            room.paused = true;
            room.reconnectDeadline = Date.now() + 60000;
            room.disconnectTimeout = setTimeout(() => {
                finishMatch(room, role === 'player1' ? 'player2' : 'player1', true);
            }, 60000);
        }
    });
});

// Вспомогательная функция для реконнекта
function tryRejoin(socket, user) {
    for (const id in rooms) {
        const r = rooms[id];
        if (r.gameOver) continue;
        if (r.player1.name === user.name && !r.player1.id) {
            r.player1.id = socket.id; socket.join(id); socket.roomId = id;
            clearTimeout(r.disconnectTimeout); r.reconnectDeadline = null;
            if (r.player2.id) r.paused = false;
            socket.emit('role', 'p1'); return true;
        }
        if (r.player2.name === user.name && !r.player2.id) {
            r.player2.id = socket.id; socket.join(id); socket.roomId = id;
            clearTimeout(r.disconnectTimeout); r.reconnectDeadline = null;
            if (r.player1.id) r.paused = false;
            socket.emit('role', 'p2'); return true;
        }
    }
    return false;
}