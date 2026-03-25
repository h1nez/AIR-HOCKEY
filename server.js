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
// 1. НАСТРОЙКИ БАЗЫ, АДМИНА И КЛАНОВ
// ==========================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:davidik12@aerohockey.5bidt7s.mongodb.net/';
const ADMIN_NICKNAME = "davidik12"; // 🔥 ВПИШИ СЮДА СВОЙ ТОЧНЫЙ НИКНЕЙМ!

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
    inventory: { type: [String], default: ['default'] },
    friends: { type: [String], default: [] },
    requests: { type: [String], default: [] },
    gamesPlayed: { type: Number, default: 0 },
    gamesWon: { type: Number, default: 0 },
    regDate: { type: Date, default: Date.now },
    maxRating: { type: Number, default: 1000 },
    minRating: { type: Number, default: 1000 },
    avatar: { type: String, default: 'avatar1' },
    regIp: { type: String, default: 'Скрыт' },
    clan: { type: String, default: null },
    clanInvites: { type: [String], default: [] },
    title: { type: String, default: '' }
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
// 2. ИГРОВАЯ ЛОГИКА И КОМНАТЫ
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));

const WIDTH = 800; const HEIGHT = 400; const PUCK_R = 22;
const rooms = {}; let roomCounter = 1;

function createRoom(isBotMatch = false, isFriendly = false) {
    const roomId = 'room_' + roomCounter++;
    rooms[roomId] = {
        id: roomId, puck: { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 },
        // 🔥 Добавили avatar и title в профиль игрока в комнате
        player1: { id: null, ip: null, name: "...", skin: "default", x: 80, y: 200, score: 0, rating: 1000, speedX: 0, speedY: 0, avatar: "avatar1", title: "" },
        player2: { id: null, ip: null, name: "...", skin: "default", x: 720, y: 200, score: 0, rating: 1000, speedX: 0, speedY: 0, avatar: "avatar1", title: "" },
        paused: true, gameOver: false, rematch: { player1: false, player2: false },
        disconnectTimeout: null, reconnectDeadline: null, timeLeft: null,
        botTimer: null, isBotMatch: isBotMatch, isFriendly: isFriendly 
    };
    return roomId;
}

function resolveCollision(puck, player) {
    let pR = 35; let res = 1.6; let pMaxSpeed = 28; 
    if (player.skin === 'kompot') pR = 43; 
    if (player.skin === 'gonya') pR = 28; 
    if (player.skin === 'korzhik') res = 1.9; 
    if (player.skin === 'gonya') res = 2.2; 
    if (player.skin === 'karamelka') pMaxSpeed = 35; 

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

async function finishMatch(room, winRole, isDisconnect = false) {
    room.paused = true; room.gameOver = true;
    if (room.botTimer) clearTimeout(room.botTimer);
    
    const win = winRole === 'player1' ? room.player1 : room.player2;
    const lose = winRole === 'player1' ? room.player2 : room.player1;
    if (lose.name === "...") return; 
    if (isDisconnect) win.score = 5; 

    if (room.isBotMatch || room.isFriendly) {
        room.rematch = { player1: false, player2: false };
        let msg = "";
        if (room.isBotMatch) {
            msg = isDisconnect ? "ВЫХОД ИЗ ТРЕНИРОВКИ" : (winRole === 'player1' ? "ПОБЕДА НАД БОТОМ! 🎉" : "БОТ ПОБЕДИЛ 🤖");
        } else {
            msg = isDisconnect ? "ДРУГ СБЕЖАЛ С ПОЛЯ БОЯ!" : `ПОБЕДИЛ: ${win.name}! 🎉`;
        }
        io.to(room.id).emit('goalNotify', { msg: msg, color: "gold" });
        setTimeout(() => { io.to(room.id).emit('showEndScreen'); }, 2000);
        return;
    }
    
    const K = 32; const diff = Math.round(K * (1 - 1/(1+Math.pow(10,(lose.rating-win.rating)/400))));
    win.rating += diff; lose.rating -= diff;
    
    try {
        if (win.id !== 'secret_bot') {
            const winnerDoc = await User.findOne({ name: win.name });
            if (winnerDoc) {
                winnerDoc.rating = win.rating; winnerDoc.coins += 25; winnerDoc.gamesPlayed += 1; winnerDoc.gamesWon += 1;
                if (win.rating > (winnerDoc.maxRating || 1000)) winnerDoc.maxRating = win.rating;
                if (win.rating < (winnerDoc.minRating || 1000)) winnerDoc.minRating = win.rating;
                await winnerDoc.save();
            }
        }
        if (lose.id !== 'secret_bot') {
            const loserDoc = await User.findOne({ name: lose.name });
            if (loserDoc) {
                loserDoc.rating = lose.rating; loserDoc.coins += 5; loserDoc.gamesPlayed += 1;
                if (lose.rating < (loserDoc.minRating || 1000)) loserDoc.minRating = lose.rating;
                if (lose.rating > (loserDoc.maxRating || 1000)) loserDoc.maxRating = lose.rating;
                await loserDoc.save();
            }
        }
    } catch (err) {}
    
    room.rematch = { player1: false, player2: false };
    if (isDisconnect) { io.to(room.id).emit('goalNotify', { msg: `ТЕХ. ПОБЕДА: ${win.name} (+${diff})`, color: "gold" }); } 
    else { io.to(room.id).emit('goalNotify', { msg: `ЧЕМПИОН: ${win.name} (+${diff})`, color: "gold" }); }
    setTimeout(() => { io.to(room.id).emit('showEndScreen'); }, 2000);
}

async function handleGoal(room, winRole) {
    room.paused = true;
    room.player1.x = 80; room.player1.y = 200; room.player2.x = 720; room.player2.y = 200;
    const win = winRole === 'player1' ? room.player1 : room.player2;
    win.score++;
    if (win.score >= 5) { await finishMatch(room, winRole, false); } 
    else {
        io.to(room.id).emit('goalNotify', { msg: `ГОЛ: ${win.name}`, color: winRole === 'player1' ? '#4da6ff' : '#ff4d4d' });
        setTimeout(() => reset(room), 2000);
    }
}

function reset(room) {
    room.puck = { x: WIDTH/2, y: HEIGHT/2, vx: 0, vy: 0 }; 
    room.player1.x = 80; room.player1.y = 200; room.player2.x = 720; room.player2.y = 200;
    if (room.player1.id && room.player2.id) {
        room.paused = false;
        io.to(room.id).emit('goalNotify', { msg: "", color: "" });
    }
}

function getRoomIdByUserName(name) {
    for (let id in rooms) {
        if (!rooms[id].gameOver && (rooms[id].player1.name === name || rooms[id].player2.name === name)) {
            return id;
        }
    }
    return null;
}

setInterval(() => {
    for (const roomId in rooms) {
        const room = rooms[roomId];
        if (room.reconnectDeadline) room.timeLeft = Math.max(0, Math.ceil((room.reconnectDeadline - Date.now()) / 1000));
        
        if (!room.paused && !room.gameOver) {
            if (room.player2.id === 'bot' || room.player2.id === 'secret_bot') {
                const bot = room.player2; const puck = room.puck;
                const oldX = bot.x; const oldY = bot.y;
                
                let targetY = puck.y; let targetX = 720; 
                if (puck.x > 400) { if (puck.x > bot.x) { targetX = 760; targetY = 200; } else { targetX = puck.x + 20; } }
                if (puck.x > 730 && (puck.y < 125 || puck.y > 275)) { targetX = 680; targetY = 200; }
                
                const botSpeed = room.player2.id === 'secret_bot' ? 7.5 : 6.0; 
                if (bot.y < targetY - botSpeed) bot.y += botSpeed; else if (bot.y > targetY + botSpeed) bot.y -= botSpeed;
                if (bot.x < targetX - botSpeed) bot.x += botSpeed; else if (bot.x > targetX + botSpeed) bot.x -= botSpeed;

                bot.x = Math.max(435, Math.min(765, bot.x)); bot.y = Math.max(35, Math.min(365, bot.y));
                bot.speedX = bot.x - oldX; bot.speedY = bot.y - oldY;
            }

            room.puck.vx *= 0.995; room.puck.vy *= 0.995; room.puck.x += room.puck.vx; room.puck.y += room.puck.vy;
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
        
        io.to(roomId).emit('gameStateUpdate', {
            id: room.id, puck: room.puck, player1: room.player1, player2: room.player2,
            paused: room.paused, gameOver: room.gameOver, timeLeft: room.timeLeft
        });
    }
}, 20);

// ==========================================
// 3. АВТОРИЗАЦИЯ И СЕТЬ
// ==========================================
function tryRejoin(socket, user) {
    for (const id in rooms) {
        const r = rooms[id]; if (r.gameOver) continue;
        if (r.player1.name === user.name && !r.player1.id) {
            r.player1.id = socket.id; socket.join(id); socket.roomId = id;
            clearTimeout(r.disconnectTimeout); r.reconnectDeadline = null; r.timeLeft = null;
            if (r.player2.id) { r.paused = false; io.to(id).emit('goalNotify', { msg: "", color: "" }); }
            socket.emit('role', 'p1'); return true;
        }
        if (r.player2.name === user.name && !r.player2.id) {
            r.player2.id = socket.id; socket.join(id); socket.roomId = id;
            clearTimeout(r.disconnectTimeout); r.reconnectDeadline = null; r.timeLeft = null;
            if (r.player1.id) { r.paused = false; io.to(id).emit('goalNotify', { msg: "", color: "" }); }
            socket.emit('role', 'p2'); return true;
        }
    } return false;
}

function joinPlayerToRoom(socket, user) {
    if (socket.roomId) return;
    let myRoomId = null;
    let rawIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || "";
    let clientIp = rawIp.split(',')[0].trim();
    if (clientIp === '::1' || clientIp === '::ffff:127.0.0.1') clientIp = '127.0.0.1'; 
    
    for (const id in rooms) { 
        if (rooms[id].gameOver || rooms[id].isBotMatch || rooms[id].isFriendly) continue; 
        if (rooms[id].player1.id && rooms[id].player1.ip === clientIp) continue;
        if (rooms[id].player1.id && rooms[id].player2.name === "...") { myRoomId = id; break; } 
    }
    
    if (!myRoomId) myRoomId = createRoom(false, false);
    const room = rooms[myRoomId]; socket.join(myRoomId); socket.roomId = myRoomId;

    if (!room.player1.id && room.player1.name === "...") {
        room.player1.id = socket.id; room.player1.ip = clientIp; room.player1.name = user.name; 
        room.player1.rating = user.rating; room.player1.skin = user.skin; 
        room.player1.avatar = user.avatar; room.player1.title = user.title;
        socket.emit('role', 'p1');

        room.botTimer = setTimeout(() => {
            if (room.player1.id && room.player2.name === "...") {
                const generateSteamName = () => {
                    const pros = ['s1mple', 'donk', 'Yatoro', 'm0NESY', 'Collapse', 'sh1ro', 'Dendi', 'Miracle-', 'Nisha', 'ZywOo', 'NiKo', 'b1t', 'ropz', 'Nightfall', 'Puppey', 'Arteezy', 'Topson', 'Jame', 'Ax1Le', 'TORONTOTOKYO'];
                    const prefixes = ['NaVi | ', 'Virtus.pro ', 'Team Spirit ', 'FaZe ', 'Liquid ', 'OG ', 'zxc ', '1000-7 ', 'Shadow_', 'Lil_', 'toxic_'];
                    const roots = ['Ghoul', 'Sniper', 'Demon', 'Angel', 'Bebra', 'Monster', 'Tractor', 'Pudge', 'Pivo', 'Gamer', 'Killer', 'Ninja', 'Samurai', 'Hokage', 'DeadInside'];
                    const suffixes = ['_pro', '2010', '228', '1337', '99', '_rus', 'God', 'XD', 'QQ', '_enjoyer'];
                    const type = Math.random();
                    if (type < 0.25) return pros[Math.floor(Math.random() * pros.length)];
                    else if (type < 0.5) return prefixes[Math.floor(Math.random() * prefixes.length)] + roots[Math.floor(Math.random() * roots.length)];
                    else if (type < 0.75) return roots[Math.floor(Math.random() * roots.length)] + suffixes[Math.floor(Math.random() * suffixes.length)];
                    else return roots[Math.floor(Math.random() * roots.length)].toLowerCase() + ['_zxc', '_god', '_qwe', '_123', '_pos1'][Math.floor(Math.random() * 5)];
                };
                const fakeSkins = ['default', 'korzhik', 'karamelka', 'kompot', 'gonya'];
                room.player2.id = 'secret_bot'; room.player2.ip = 'bot_ip';
                room.player2.name = generateSteamName(); room.player2.skin = fakeSkins[Math.floor(Math.random() * fakeSkins.length)];
                room.player2.rating = Math.max(0, room.player1.rating + Math.floor(Math.random() * 60) - 30);
                room.player2.avatar = "avatar4"; room.player2.title = "Искусственный интеллект";
                
                // 🔥 Показываем VS Экран
                room.paused = true;
                io.to(myRoomId).emit('showVsScreen', { p1: room.player1, p2: room.player2 });
                setTimeout(() => { if (rooms[myRoomId] && !rooms[myRoomId].gameOver) rooms[myRoomId].paused = false; }, 3000);
            }
        }, 15000);
    } else if (!room.player2.id && room.player2.name === "...") {
        room.player2.id = socket.id; room.player2.ip = clientIp; room.player2.name = user.name; 
        room.player2.rating = user.rating; room.player2.skin = user.skin;
        room.player2.avatar = user.avatar; room.player2.title = user.title;
        socket.emit('role', 'p2');
        if (room.botTimer) clearTimeout(room.botTimer); 
        
        // 🔥 Показываем VS Экран
        room.paused = true;
        io.to(myRoomId).emit('showVsScreen', { p1: room.player1, p2: room.player2 });
        setTimeout(() => { if (rooms[myRoomId] && !rooms[myRoomId].gameOver) rooms[myRoomId].paused = false; }, 3000);
    }
}

io.on('connection', (socket) => {
    
    socket.on('spectate', (roomId) => {
        if (!socket.user || !rooms[roomId]) return;
        socket.join(roomId);
        socket.roomId = roomId;
        socket.emit('role', 'spectator');
        socket.emit('forceStartGame');
    });

    socket.on('sendGift', async (data, callback) => {
        if (!socket.user || isNaN(data.amount) || data.amount <= 0) return callback({ success: false, msg: "Неверная сумма" });
        try {
            const u = await User.findById(socket.user._id);
            if (u.coins < data.amount) return callback({ success: false, msg: "Недостаточно монет!" });
            
            const target = await User.findOne({ name: data.targetName });
            if (!target) return callback({ success: false, msg: "Игрок не найден!" });
            if (u.name === target.name) return callback({ success: false, msg: "Нельзя дарить самому себе :)" });

            u.coins -= Number(data.amount); target.coins += Number(data.amount);
            await u.save(); await target.save(); socket.user = u;
            callback({ success: true, msg: `Вы успешно подарили ${data.amount} монет игроку ${target.name}!` });
        } catch(e) { callback({ success: false, msg: "Ошибка транзакции." }); }
    });

    socket.on('setTitle', async (title, callback) => {
        if (!socket.user) return;
        try {
            const u = await User.findById(socket.user._id); u.title = title; await u.save(); socket.user = u; callback({ success: true });
        } catch(e) { callback({ success: false }); }
    });

    socket.on('getClanData', async (callback) => {
        if (!socket.user) return callback({ success: false });
        const u = await User.findById(socket.user._id); socket.user = u;
        if (!u.clan) return callback({ success: true, clan: null, invites: u.clanInvites });
        const clan = await Clan.findOne({ name: u.clan }).lean();
        if (!clan) { u.clan = null; await u.save(); return callback({ success: true, clan: null, invites: u.clanInvites }); }
        callback({ success: true, clan });
    });

    socket.on('createClan', async (data, callback) => {
        if (!socket.user) return;
        try {
            const u = await User.findById(socket.user._id);
            if (u.clan) return callback({ success: false, msg: "Вы уже состоите в клане!" });
            const existingClan = await Clan.findOne({ name: data.name });
            if (existingClan) return callback({ success: false, msg: "Клан с таким именем уже существует!" });

            const newClan = new Clan({ name: data.name, maxMembers: data.maxMembers, isPrivate: data.isPrivate, leader: u.name, members: [u.name] });
            await newClan.save(); u.clan = newClan.name; await u.save(); socket.user = u;
            callback({ success: true, msg: "Клан успешно создан!" });
        } catch(e) { callback({ success: false, msg: "Ошибка сервера при создании." }); }
    });

    socket.on('searchClans', async (callback) => {
        try { const clans = await Clan.find().select('name leader members maxMembers isPrivate').limit(20).lean(); callback({ success: true, clans }); } catch(e) { callback({ success: false }); }
    });

    socket.on('joinClan', async (clanName, callback) => {
        if (!socket.user) return;
        try {
            const u = await User.findById(socket.user._id);
            if (u.clan) return callback({ success: false, msg: "Вы уже в клане!" });
            const clan = await Clan.findOne({ name: clanName });
            if (!clan) return callback({ success: false, msg: "Клан не найден!" });
            if (clan.isPrivate) return callback({ success: false, msg: "Это закрытый клан! Вход только по приглашению." });
            if (clan.members.length >= clan.maxMembers) return callback({ success: false, msg: "Клан полностью заполнен!" });
            clan.members.push(u.name); await clan.save(); u.clan = clan.name; await u.save(); socket.user = u;
            callback({ success: true, msg: "Вы успешно вступили в клан!" });
        } catch(e) { callback({ success: false }); }
    });

    socket.on('inviteToClan', async (targetName, callback) => {
        if (!socket.user || !socket.user.clan) return callback({ success: false, msg: "Вы не в клане." });
        try {
            const clan = await Clan.findOne({ name: socket.user.clan });
            if (!clan) return callback({ success: false, msg: "Клан не найден." });
            if (clan.leader !== socket.user.name && !clan.deputies.includes(socket.user.name)) return callback({ success: false, msg: "Только лидер или зам может приглашать!" });
            if (clan.members.length >= clan.maxMembers) return callback({ success: false, msg: "В клане больше нет мест!" });
            const target = await User.findOne({ name: targetName });
            if (!target) return callback({ success: false, msg: "Игрок не найден." });
            if (target.clan) return callback({ success: false, msg: "Игрок уже состоит в клане." });
            if (target.clanInvites.includes(clan.name)) return callback({ success: false, msg: "Приглашение уже было отправлено." });
            target.clanInvites.push(clan.name); await target.save();
            const targetSocketId = connectedUsers[targetName]; if (targetSocketId) { io.to(targetSocketId).emit('incomingClanInvite', clan.name); }
            callback({ success: true, msg: "Приглашение отправлено!" });
        } catch(e) { callback({ success: false }); }
    });

    socket.on('acceptClanInvite', async (clanName, callback) => {
        if (!socket.user) return;
        try {
            const u = await User.findById(socket.user._id);
            if (u.clan) return callback({ success: false, msg: "Вы уже в клане." });
            if (!u.clanInvites.includes(clanName)) return callback({ success: false, msg: "Приглашение не найдено." });
            const clan = await Clan.findOne({ name: clanName }); u.clanInvites = u.clanInvites.filter(c => c !== clanName);
            if (!clan) { await u.save(); return callback({ success: false, msg: "Клан больше не существует." }); }
            if (clan.members.length >= clan.maxMembers) { await u.save(); return callback({ success: false, msg: "В клане больше нет мест." }); }
            clan.members.push(u.name); await clan.save(); u.clan = clan.name; await u.save(); socket.user = u;
            clan.members.forEach(member => { const sId = connectedUsers[member]; if (sId) io.to(sId).emit('clanUpdated'); });
            callback({ success: true, msg: `Вы вступили в клан ${clan.name}!` });
        } catch(e) { callback({ success: false }); }
    });

    socket.on('rejectClanInvite', async (clanName, callback) => {
        if (!socket.user) return;
        try { const u = await User.findById(socket.user._id); u.clanInvites = u.clanInvites.filter(c => c !== clanName); await u.save(); callback({ success: true }); } catch(e) { callback({ success: false }); }
    });

    socket.on('leaveClan', async (callback) => {
        if (!socket.user || !socket.user.clan) return callback({ success: false });
        try {
            const u = await User.findById(socket.user._id); const clanName = u.clan; const clan = await Clan.findOne({ name: clanName }); u.clan = null; await u.save(); socket.user = u;
            if (clan) {
                clan.members = clan.members.filter(m => m !== u.name); clan.deputies = clan.deputies.filter(m => m !== u.name);
                if (clan.members.length === 0) { await Clan.deleteOne({ name: clanName }); } else if (clan.leader === u.name) { if (clan.deputies.length > 0) clan.leader = clan.deputies[0]; else clan.leader = clan.members[0]; await clan.save(); } else { await clan.save(); }
                clan.members.forEach(member => { const sId = connectedUsers[member]; if (sId) io.to(sId).emit('clanUpdated'); });
            }
            callback({ success: true });
        } catch(e) { callback({ success: false }); }
    });

    socket.on('clanAction', async (data, callback) => {
        if (!socket.user || !socket.user.clan) return callback({ success: false, msg: "Вы не в клане." });
        try {
            const clan = await Clan.findOne({ name: socket.user.clan }); if (!clan) return callback({ success: false });
            const isLeader = clan.leader === socket.user.name; const isDeputy = clan.deputies.includes(socket.user.name);
            if (data.action === 'kick') {
                const targetIsLeader = clan.leader === data.targetName; const targetIsDeputy = clan.deputies.includes(data.targetName);
                if (!isLeader && !isDeputy) return callback({ success: false, msg: "Нет прав." });
                if (targetIsLeader) return callback({ success: false, msg: "Нельзя кикнуть лидера." });
                if (isDeputy && targetIsDeputy) return callback({ success: false, msg: "Зам не может кикнуть зама." });
                clan.members = clan.members.filter(m => m !== data.targetName); clan.deputies = clan.deputies.filter(m => m !== data.targetName); await clan.save();
                const targetUser = await User.findOne({ name: data.targetName }); if (targetUser) { targetUser.clan = null; await targetUser.save(); } callback({ success: true });
            } 
            else if (data.action === 'promote' || data.action === 'demote') {
                if (!isLeader) return callback({ success: false, msg: "Только лидер может управлять замами." });
                if (data.action === 'promote' && !clan.deputies.includes(data.targetName)) { clan.deputies.push(data.targetName); } else if (data.action === 'demote') { clan.deputies = clan.deputies.filter(m => m !== data.targetName); } await clan.save(); callback({ success: true });
            }
            clan.members.forEach(member => { const sId = connectedUsers[member]; if (sId) io.to(sId).emit('clanUpdated'); });
        } catch(e) { callback({ success: false }); }
    });

    socket.on('sendClanChat', async (msg) => {
        if (!socket.user || !socket.user.clan || !msg || msg.trim() === '') return;
        try {
            const clan = await Clan.findOne({ name: socket.user.clan }); if (!clan) return;
            let titleStr = socket.user.title ? `[${socket.user.title}] ` : "";
            const chatMsg = { name: titleStr + socket.user.name, msg: msg.substring(0, 100), time: Date.now() };
            clan.chat.push(chatMsg); if (clan.chat.length > 50) clan.chat.shift(); await clan.save();
            clan.members.forEach(member => { const sId = connectedUsers[member]; if (sId) io.to(sId).emit('newClanMsg', chatMsg); });
        } catch(e) {}
    });

    socket.on('globalChat', (msg) => {
        if (!socket.user || !msg || msg.trim() === '') return;
        let titleStr = socket.user.title ? `[${socket.user.title}] ` : ""; let prefix = socket.user.name === ADMIN_NICKNAME ? "👑 " : "";
        io.emit('chatMessage', { name: prefix + titleStr + socket.user.name, msg: msg.substring(0, 100) });
    });

    socket.on('sendEmoji', (emoji) => {
        if (!socket.roomId || !rooms[socket.roomId] || !socket.user) return;
        const room = rooms[socket.roomId]; let role = 'spectator'; if (socket.id === room.player1.id) role = 'p1'; else if (socket.id === room.player2.id) role = 'p2';
        io.to(socket.roomId).emit('showEmoji', { role, emoji });
    });

    // 🔥 ДОБАВЛЕНА ПРОВЕРКА ОНЛАЙНА В АДМИНКЕ
    socket.on('adminGetUsers', async (callback) => {
        if (!socket.user || socket.user.name !== ADMIN_NICKNAME) return callback({ success: false });
        try { 
            const users = await User.find().select('name rating coins regIp clan').lean(); 
            const enhanced = users.map(u => ({ ...u, isOnline: !!connectedUsers[u.name] }));
            callback({ success: true, users: enhanced }); 
        } catch(e) { callback({ success: false }); }
    });

    socket.on('adminAction', async (data, callback) => {
        if (!socket.user || socket.user.name !== ADMIN_NICKNAME) return callback({ success: false, msg: "Нет прав!" });
        try {
            const target = await User.findOne({ name: data.targetName }); if (!target) return callback({ success: false, msg: "Игрок не найден!" });
            if (data.action === 'addCoins') { target.coins += Number(data.amount); await target.save(); } 
            else if (data.action === 'setElo') { target.rating = Number(data.amount); await target.save(); } 
            else if (data.action === 'ban') {
                await User.deleteOne({ name: data.targetName });
                const tSocketId = connectedUsers[data.targetName];
                if (tSocketId) { io.to(tSocketId).emit('forceReload'); const ts = io.sockets.sockets.get(tSocketId); if (ts) ts.disconnect(); }
            }
            callback({ success: true, msg: "Успешно!" });
        } catch(e) { callback({ success: false, msg: "Ошибка сервера" }); }
    });

    socket.on('register', async (data, callback) => {
        try {
            if (!data.name || !data.password) return callback({ success: false, msg: "Заполните все поля!" });
            const existing = await User.findOne({ name: data.name }); if (existing) return callback({ success: false, msg: "Это имя уже занято!" });
            let rawIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || "Неизвестно"; let clientIp = rawIp.split(',')[0].trim(); if (clientIp === '::1' || clientIp === '::ffff:127.0.0.1') clientIp = '127.0.0.1 (Локальный)';
            const hashedPassword = await bcrypt.hash(data.password, 10); const newUser = new User({ name: data.name, password: hashedPassword, regIp: clientIp }); await newUser.save();
            socket.user = newUser; connectedUsers[newUser.name] = socket.id;
            if (tryRejoin(socket, newUser)) callback({ success: true, rejoining: true }); else callback({ success: true, rejoining: false });
        } catch(e) { callback({ success: false, msg: "Ошибка сервера" }); }
    });

    socket.on('login', async (data, callback) => {
        try {
            if (!data.name || !data.password) return callback({ success: false, msg: "Заполните все поля!" });
            const user = await User.findOne({ name: data.name }); if (!user) return callback({ success: false, msg: "Аккаунт не найден!" });
            const isMatch = await bcrypt.compare(data.password, user.password); if (!isMatch) return callback({ success: false, msg: "Неверный пароль!" });
            socket.user = user; connectedUsers[user.name] = socket.id;
            if (tryRejoin(socket, user)) callback({ success: true, rejoining: true }); else callback({ success: true, rejoining: false });
        } catch(e) { callback({ success: false, msg: "Ошибка сервера" }); }
    });

    socket.on('play', () => { if (socket.user) joinPlayerToRoom(socket, socket.user); else socket.emit('forceReload'); });

    socket.on('playBot', () => {
        if (!socket.user || socket.roomId) return;
        const roomId = createRoom(true, false); const room = rooms[roomId];
        room.player1 = { id: socket.id, ip: "local", name: socket.user.name, skin: socket.user.skin, x: 80, y: 200, score: 0, rating: socket.user.rating, speedX: 0, speedY: 0, avatar: socket.user.avatar, title: socket.user.title };
        room.player2 = { id: 'bot', ip: "bot", name: "Бот Вася 🤖", skin: "default", x: 720, y: 200, score: 0, rating: "---", speedX: 0, speedY: 0, avatar: "avatar4", title: "Искусственный интеллект" };
        socket.join(roomId); socket.roomId = roomId; socket.emit('role', 'p1');
        
        // 🔥 VS ЭКРАН (Бот)
        room.paused = true;
        io.to(roomId).emit('showVsScreen', { p1: room.player1, p2: room.player2 });
        setTimeout(() => { if (rooms[roomId] && !rooms[roomId].gameOver) rooms[roomId].paused = false; }, 3000);
    });

    socket.on('rematch', () => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        const room = rooms[socket.roomId];
        if (socket.id === room.player1.id) room.rematch.player1 = true; if (socket.id === room.player2.id) room.rematch.player2 = true;
        if ((room.isBotMatch || room.player2.id === 'secret_bot') && room.rematch.player1) room.rematch.player2 = true; 
        if (room.rematch.player1 && room.rematch.player2) { 
            room.player1.score = 0; room.player2.score = 0; room.gameOver = false; reset(room); io.to(room.id).emit('hideEndScreen'); 
            // 🔥 VS ЭКРАН (Реванш)
            room.paused = true;
            io.to(room.id).emit('showVsScreen', { p1: room.player1, p2: room.player2 });
            setTimeout(() => { if (rooms[room.id] && !rooms[room.id].gameOver) rooms[room.id].paused = false; }, 3000);
        }
    });

    socket.on('leaveMatch', () => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        const room = rooms[socket.roomId]; if (room.botTimer) clearTimeout(room.botTimer); 
        const isPlayer = (socket.id === room.player1.id || socket.id === room.player2.id);
        if (!isPlayer) { socket.leave(socket.roomId); socket.roomId = null; return; }
        const role = room.player1.id === socket.id ? 'player1' : 'player2'; const winRole = role === 'player1' ? 'player2' : 'player1';
        if (room.player2.name !== "..." && !room.gameOver) { finishMatch(room, winRole, true); } else { socket.to(room.id).emit('opponentLeft'); }
        if (room.player1.id === socket.id) { room.player1.id = null; room.player1.ip = null; } if (room.player2.id === socket.id) { room.player2.id = null; room.player2.ip = null; }
        if (!room.player1.id && (!room.player2.id || room.player2.id === 'bot' || room.player2.id === 'secret_bot')) { clearTimeout(room.disconnectTimeout); delete rooms[socket.roomId]; }
        socket.leave(socket.roomId); socket.roomId = null; 
    });

    socket.on('cancelPlay', () => {
        if (!socket.roomId || !rooms[socket.roomId]) return;
        const room = rooms[socket.roomId]; if (room.botTimer) clearTimeout(room.botTimer); 
        if (room.player1.id === socket.id) { room.player1.id = null; room.player1.name = "..."; room.player1.ip = null; }
        if (room.player2.id === socket.id) { room.player2.id = null; room.player2.name = "..."; room.player2.ip = null; }
        if (!room.player1.id && !room.player2.id) delete rooms[socket.roomId]; socket.leave(socket.roomId); socket.roomId = null; 
    });

    socket.on('inviteFriend', (friendName, callback) => {
        if (!socket.user) return;
        const targetSocketId = connectedUsers[friendName]; if (!targetSocketId) return callback({ success: false, msg: "Игрок сейчас не в сети!" });
        const targetSocket = io.sockets.sockets.get(targetSocketId); if (targetSocket && targetSocket.roomId) return callback({ success: false, msg: "Игрок уже в матче!" });
        io.to(targetSocketId).emit('incomingInvite', socket.user.name); callback({ success: true, msg: "Приглашение отправлено!" });
    });

    socket.on('acceptInvite', async (senderName) => {
        if (!socket.user) return;
        const senderSocketId = connectedUsers[senderName]; if (!senderSocketId) return;
        const senderSocket = io.sockets.sockets.get(senderSocketId); if (!senderSocket || senderSocket.roomId || socket.roomId) return;

        const roomId = createRoom(false, true); const room = rooms[roomId];
        const u1 = await User.findOne({ name: senderSocket.user.name }).lean(); const u2 = await User.findOne({ name: socket.user.name }).lean();

        room.player1 = { id: senderSocket.id, ip: "friend1", name: u1.name, skin: u1.skin, x: 80, y: 200, score: 0, rating: u1.rating, speedX: 0, speedY: 0, avatar: u1.avatar, title: u1.title };
        room.player2 = { id: socket.id, ip: "friend2", name: u2.name, skin: u2.skin, x: 720, y: 200, score: 0, rating: u2.rating, speedX: 0, speedY: 0, avatar: u2.avatar, title: u2.title };

        senderSocket.join(roomId); senderSocket.roomId = roomId; senderSocket.emit('role', 'p1'); senderSocket.emit('forceStartGame'); 
        socket.join(roomId); socket.roomId = roomId; socket.emit('role', 'p2'); socket.emit('forceStartGame'); 
        
        // 🔥 VS ЭКРАН (Приглашение)
        room.paused = true;
        io.to(roomId).emit('showVsScreen', { p1: room.player1, p2: room.player2 });
        setTimeout(() => { if (rooms[roomId] && !rooms[roomId].gameOver) rooms[roomId].paused = false; }, 3000);
    });

    socket.on('declineInvite', (senderName) => { const senderSocketId = connectedUsers[senderName]; if (senderSocketId) io.to(senderSocketId).emit('inviteDeclined', socket.user.name); });

    socket.on('getProfile', async (callback) => {
        if (!socket.user) return;
        const u = await User.findById(socket.user._id); socket.user = u; 
        callback({ success: true, coins: u.coins, skin: u.skin, inventory: u.inventory, reqCount: u.requests.length, isAdmin: u.name === ADMIN_NICKNAME, clanName: u.clan, title: u.title });
    });

    socket.on('getUserProfile', async (username, callback) => {
        try {
            const target = await User.findOne({ name: username }).select('-password -inventory -requests -friends').lean();
            if (target) { const isOnline = !!connectedUsers[username]; callback({ success: true, profile: target, isOnline: isOnline }); }
            else callback({ success: false, msg: "Игрок не найден" });
        } catch(e) { callback({ success: false }); }
    });

    socket.on('setAvatar', async (avatar, callback) => {
        if (!socket.user) return;
        try { const u = await User.findById(socket.user._id); u.avatar = avatar; await u.save(); socket.user = u; callback({ success: true }); } catch(e) { callback({ success: false }); }
    });

    socket.on('buySkin', async (skinName, callback) => {
        if (!socket.user) return;
        const prices = { korzhik: 50, karamelka: 50, kompot: 50, gonya: 75, default: 0 };
        const u = await User.findById(socket.user._id);
        if (u.inventory.includes(skinName)) { u.skin = skinName; await u.save(); socket.user = u; return callback({ success: true, coins: u.coins, skin: u.skin, inventory: u.inventory }); }
        if (u.coins >= prices[skinName]) { u.coins -= prices[skinName]; u.inventory.push(skinName); u.skin = skinName; await u.save(); socket.user = u; return callback({ success: true, coins: u.coins, skin: u.skin, inventory: u.inventory }); } 
        else { return callback({ success: false, msg: "Не хватает монет!" }); }
    });

    socket.on('getFriendsData', async (callback) => {
        if (!socket.user) return;
        try {
            const u = await User.findById(socket.user._id);
            const friendsProfiles = await User.find({ name: { $in: u.friends } }).select('name rating skin').lean();
            const friendsWithStatus = friendsProfiles.map(f => { const inGameRoom = getRoomIdByUserName(f.name); return { ...f, inGameRoom: inGameRoom }; });
            callback({ success: true, friends: friendsWithStatus, requests: u.requests });
        } catch(e) { callback({ success: false }); }
    });

    socket.on('searchUser', async (query, callback) => {
        if (!socket.user || !query) return;
        try { const users = await User.find({ $and: [{ name: new RegExp(query, 'i') }, { name: { $ne: socket.user.name } }] }).limit(5).select('name rating').lean(); callback({ success: true, users }); } catch(e) { callback({ success: false }); }
    });

    socket.on('sendFriendRequest', async (targetName, callback) => {
        if (!socket.user) return;
        try {
            const target = await User.findOne({ name: targetName }); if (!target) return callback({ success: false, msg: "Игрок не найден" });
            if (target.friends.includes(socket.user.name)) return callback({ success: false, msg: "Уже в друзьях" });
            if (target.requests.includes(socket.user.name)) return callback({ success: false, msg: "Запрос уже отправлен" });
            target.requests.push(socket.user.name); await target.save(); callback({ success: true, msg: "Запрос отправлен!" });
        } catch(e) { callback({ success: false, msg: "Ошибка" }); }
    });

    socket.on('acceptFriend', async (senderName, callback) => {
        if (!socket.user) return;
        try {
            const u = await User.findById(socket.user._id); const sender = await User.findOne({ name: senderName }); u.requests = u.requests.filter(n => n !== senderName);
            if (sender && !u.friends.includes(senderName)) { u.friends.push(senderName); if (!sender.friends.includes(u.name)) { sender.friends.push(u.name); await sender.save(); } }
            await u.save(); callback({ success: true });
        } catch(e) { callback({ success: false }); }
    });

    socket.on('rejectFriend', async (senderName, callback) => {
        if (!socket.user) return;
        try { const u = await User.findById(socket.user._id); u.requests = u.requests.filter(n => n !== senderName); await u.save(); callback({ success: true }); } catch(e) { callback({ success: false }); }
    });

    socket.on('removeFriend', async (friendName, callback) => {
        if (!socket.user) return;
        try {
            const u = await User.findById(socket.user._id); const friend = await User.findOne({ name: friendName }); u.friends = u.friends.filter(n => n !== friendName);
            if (friend) { friend.friends = friend.friends.filter(n => n !== u.name); await friend.save(); }
            await u.save(); callback({ success: true });
        } catch(e) { callback({ success: false }); }
    });

    socket.on('getLeaderboard', async (callback) => {
        try { const topUsers = await User.find().sort({ rating: -1 }).limit(10).select('name rating clan -_id').lean(); callback({ success: true, leaderboard: topUsers }); } catch(e) { callback({ success: false }); }
    });

    socket.on('input', (data) => {
        if (!socket.roomId || !rooms[socket.roomId]) return; 
        const room = rooms[socket.roomId]; const p = socket.id === room.player1.id ? room.player1 : (socket.id === room.player2.id ? room.player2 : null);
        if (p && !room.paused && !room.gameOver) {
            const oldX = p.x; const oldY = p.y;
            let pR = p.skin === 'kompot' ? 43 : (p.skin === 'gonya' ? 28 : 35);
            let minX = p === room.player1 ? pR : 400 + pR; let maxX = p === room.player1 ? 400 - pR : 800 - pR;
            p.x = Math.min(maxX, Math.max(minX, data.x)); p.y = Math.min(400 - pR, Math.max(pR, data.y)); p.speedX = p.x - oldX; p.speedY = p.y - oldY;
        }
    });

    socket.on('disconnect', () => {
        if (socket.user && connectedUsers[socket.user.name] === socket.id) { delete connectedUsers[socket.user.name]; }
        if (!socket.roomId || !rooms[socket.roomId]) return;
        const room = rooms[socket.roomId]; const isPlayer = (socket.id === room.player1.id || socket.id === room.player2.id); if (!isPlayer) return; 
        const role = socket.id === room.player1.id ? 'player1' : 'player2';
        if (role) {
            room[role].id = null;
            if (room.player2.name === "..." || room.gameOver) { if (!room.player1.id && (!room.player2.id || room.player2.id === 'bot' || room.player2.id === 'secret_bot')) delete rooms[socket.roomId]; return; }
            if (!room.player1.id && (!room.player2.id || room.player2.id === 'bot' || room.player2.id === 'secret_bot')) { clearTimeout(room.disconnectTimeout); delete rooms[socket.roomId]; return; }
            room.paused = true; room.reconnectDeadline = Date.now() + 60000; if (room.disconnectTimeout) clearTimeout(room.disconnectTimeout);
            room.disconnectTimeout = setTimeout(() => { const winRole = role === 'player1' ? 'player2' : 'player1'; finishMatch(room, winRole, true); }, 60000);
        }
    });
});