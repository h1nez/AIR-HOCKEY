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
// 1. НАСТРОЙКИ БАЗЫ И АДМИНА
// ==========================================
const MONGODB_URI = process.env.MONGODB_URI || 'ТВОЯ_ССЫЛКА_НА_MONGODB';
const ADMIN_NICKNAME = "ТВОЙ_НИК"; // Впиши свой ник для доступа к админке

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

// Схема игрока
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
    // Боевой пропуск
    bpLevel: { type: Number, default: 0 },
    bpXP: { type: Number, default: 0 },
    goalEffects: { type: [String], default: ['default'] },
    currentGoalEffect: { type: String, default: 'default' },
    vsCases: { type: Number, default: 1 },
    vsEffects: { type: [String], default: ['none'] },
    currentVsEffect: { type: String, default: 'none' }
});
const User = mongoose.model('User', userSchema);

// Схема клана
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
// 2. СИСТЕМА ТУРНИРОВ (СОСТОЯНИЕ)
// ==========================================
let tourney = {
    state: 'idle',    // 'idle', 'reg', 'playing'
    players: [],      // Список ников участников
    winners: [],      // Победители раунда
    matchesActive: 0, // Кол-во идущих игр
    round: 1
};

function resetTourney() {
    tourney = { state: 'idle', players: [], winners: [], matchesActive: 0, round: 1 };
}

// ==========================================
// 3. ИГРОВАЯ ЛОГИКА (ЯДРО)
// ==========================================
app.use(express.static(path.join(__dirname, 'public')));

const WIDTH = 800; const HEIGHT = 400; const PUCK_R = 22;
const rooms = {}; let roomCounter = 1;

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

// Физика столкновений (с учетом баффов Сажика)
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

// Выдача опыта БП
async function applyBP(userName, xpAdded, socketId) {
    if (userName === "..." || userName.includes("Бот")) return;
    try {
        const userDoc = await User.findOne({ name: userName });
        if (!userDoc) return;
        userDoc.bpXP += xpAdded;
        let leveledUp = false; let rewards = [];
        while (userDoc.bpXP >= 100 && userDoc.bpLevel < 30) {
            userDoc.bpXP -= 100; userDoc.bpLevel++; leveledUp = true;
            if (userDoc.bpLevel === 10) { if (!userDoc.goalEffects.includes('fire')) userDoc.goalEffects.push('fire'); rewards.push('Эффект: Огонь 🔥'); }
            else if (userDoc.bpLevel === 20) { if (!userDoc.goalEffects.includes('blackhole')) userDoc.goalEffects.push('blackhole'); rewards.push('Эффект: Дыра 🌌'); }
            else if (userDoc.bpLevel === 25) { userDoc.vsCases++; rewards.push('VS-Кейс 🎁'); }
            else if (userDoc.bpLevel === 30) { if (!userDoc.goalEffects.includes('ice')) userDoc.goalEffects.push('ice'); rewards.push('Эффект: Лед ❄️'); }
            else { userDoc.coins += 50; rewards.push('50 Монет 💰'); }
        }
        await userDoc.save();
        if (leveledUp && socketId) io.to(socketId).emit('bpLevelUp', { level: userDoc.bpLevel, rewards });
    } catch(e) {}
}

// Завершение матча
async function finishMatch(room, winRole, isDisconnect = false) {
    room.paused = true; room.gameOver = true;
    if (room.botTimer) clearTimeout(room.botTimer);
    
    const win = winRole === 'player1' ? room.player1 : room.player2;
    const lose = winRole === 'player1' ? room.player2 : room.player1;
    if (lose.name === "...") return; 
    if (isDisconnect) win.score = 5; 

    // 🔥 ТУРНИРНЫЙ ФИНИШ
    if (room.isTournament) {
        tourney.matchesActive--;
        if (win.id !== 'bot' && win.id !== 'secret_bot') {
            tourney.winners.push(win.name);
            const wSid = connectedUsers[win.name];
            if (wSid) io.to(wSid).emit('tourneyMsg', `Вы прошли в следующий раунд!`);
        }
        io.to(room.id).emit('goalNotify', { msg: `ТУРНИР: ПОБЕДА ${win.name}!`, color: "gold", effectType: win.effect });
        setTimeout(() => io.to(room.id).emit('showEndScreen'), 2000);
        if (tourney.matchesActive <= 0) startNextTournamentRound();
        return;
    }

    // Опыт БП (только онлайн матчи)
    if (!room.isFriendly && !room.isBotMatch) {
        if (win.id && !win.id.includes('bot')) await applyBP(win.name, 50, win.id);
        if (lose.id && !lose.id.includes('bot')) await applyBP(lose.name, 20, lose.id);
    }

    // ЭЛО и монеты (не тренировка и не друзья)
    if (!room.isBotMatch && !room.isFriendly) {
        const K = 32; const diff = Math.round(K * (1 - 1/(1+Math.pow(10,(lose.rating-win.rating)/400))));
        win.rating += diff; lose.rating -= diff;
        try {
            const winner = await User.findOne({ name: win.name });
            if (winner) { winner.rating = win.rating; winner.coins += 25; winner.gamesPlayed++; winner.gamesWon++; if (win.rating > winner.maxRating) winner.maxRating = win.rating; await winner.save(); }
            const loser = await User.findOne({ name: lose.name });
            if (loser) { loser.rating = lose.rating; loser.coins += 5; loser.gamesPlayed++; if (lose.rating < loser.minRating) loser.minRating = lose.rating; await loser.save(); }
        } catch (e) {}
        io.to(room.id).emit('goalNotify', { msg: `ЧЕМПИОН: ${win.name} (+${diff})`, color: "gold", effectType: win.effect });
    } else {
        io.to(room.id).emit('goalNotify', { msg: `ПОБЕДА: ${win.name}!`, color: "gold", effectType: win.effect });
    }
    setTimeout(() => io.to(room.id).emit('showEndScreen'), 2000);
}

// Функция запуска раунда турнира
async function startNextTournamentRound() {
    tourney.players = [...tourney.winners];
    tourney.winners = [];
    if (tourney.players.length === 1) {
        const champion = tourney.players[0];
        io.emit('tourneyAnnounce', { type: 'end', msg: `🏆 ТУРНИР ОКОНЧЕН! Победитель: ${champion}!` });
        const u = await User.findOne({ name: champion });
        if (u) { u.title = "Чемпион Недели 🏆"; u.coins += 1000; await u.save(); }
        resetTourney();
        return;
    }
    if (tourney.players.length === 0) { resetTourney(); return; }

    tourney.round++;
    let shuffled = tourney.players.sort(() => 0.5 - Math.random());
    tourney.matchesActive = 0;
    for (let i = 0; i < shuffled.length; i += 2) {
        if (i + 1 < shuffled.length) {
            setupTournamentMatch(shuffled[i], shuffled[i+1]);
        } else {
            tourney.winners.push(shuffled[i]);
            const sid = connectedUsers[shuffled[i]];
            if (sid) io.to(sid).emit('tourneyMsg', `Вам не досталось пары, авто-проход дальше!`);
        }
    }
    if (tourney.matchesActive === 0 && tourney.winners.length > 0) startNextTournamentRound();
}

async function setupTournamentMatch(p1Name, p2Name) {
    const s1 = connectedUsers[p1Name]; const s2 = connectedUsers[p2Name];
    if (!s1 && !s2) return;
    if (!s1) { tourney.winners.push(p2Name); return; }
    if (!s2) { tourney.winners.push(p1Name); return; }

    const u1 = await User.findOne({ name: p1Name }).lean();
    const u2 = await User.findOne({ name: p2Name }).lean();
    const rid = createRoom(false, false, true); const r = rooms[rid];
    
    [s1, s2].forEach((s, idx) => {
        const socket = io.sockets.sockets.get(s);
        if (socket) { socket.leave(socket.roomId); socket.join(rid); socket.roomId = rid; socket.emit('role', idx === 0 ? 'p1' : 'p2'); socket.emit('forceStartGame'); }
    });

    r.player1 = { id: s1, name: u1.name, skin: u1.skin, x: 80, y: 200, score: 0, rating: u1.rating, avatar: u1.avatar, effect: u1.currentGoalEffect, vsEffect: u1.currentVsEffect };
    r.player2 = { id: s2, name: u2.name, skin: u2.skin, x: 720, y: 200, score: 0, rating: u2.rating, avatar: u2.avatar, effect: u2.currentGoalEffect, vsEffect: u2.currentVsEffect };
    tourney.matchesActive++;
    io.to(rid).emit('showVsScreen', { p1: r.player1, p2: r.player2 });
    setTimeout(() => { if (rooms[rid]) rooms[rid].paused = false; }, 3000);
}

// Обработка гола
async function handleGoal(room, winRole) {
    room.paused = true;
    room.player1.x = 80; room.player1.y = 200; room.player2.x = 720; room.player2.y = 200;
    const win = winRole === 'player1' ? room.player1 : room.player2;
    win.score++;
    if (win.score >= 5) { await finishMatch(room, winRole, false); } 
    else {
        io.to(room.id).emit('goalNotify', { msg: `ГОЛ: ${win.name}`, color: winRole === 'player1' ? '#4da6ff' : '#ff4d4d', effectType: win.effect });
        setTimeout(() => { if (rooms[room.id] && !rooms[room.id].gameOver) { rooms[room.id].puck = { x: WIDTH/2, y: HEIGHT/2, vx: 0, vy: 0 }; rooms[room.id].paused = false; io.to(room.id).emit('goalNotify', { msg: "", color: "" }); } }, 2000);
    }
}

// Игровой цикл
setInterval(() => {
    for (const id in rooms) {
        const r = rooms[id];
        if (r.reconnectDeadline) r.timeLeft = Math.max(0, Math.ceil((r.reconnectDeadline - Date.now()) / 1000));
        if (!r.paused && !r.gameOver) {
            if (r.player2.id && r.player2.id.includes('bot')) {
                const bot = r.player2; const puck = r.puck; const oldX = bot.x; const oldY = bot.y;
                let tx = 720, ty = puck.y;
                if (puck.x > 400) { if (puck.x > bot.x) { tx = 760; ty = 200; } else { tx = puck.x + 20; } }
                const speed = r.player2.id === 'secret_bot' ? 7.5 : 6.0;
                if (bot.y < ty - speed) bot.y += speed; else if (bot.y > ty + speed) bot.y -= speed;
                if (bot.x < tx - speed) bot.x += speed; else if (bot.x > tx + speed) bot.x -= speed;
                bot.x = Math.max(435, Math.min(765, bot.x)); bot.y = Math.max(35, Math.min(365, bot.y));
                bot.speedX = bot.x - oldX; bot.speedY = bot.y - oldY;
            }
            r.puck.vx *= 0.995; r.puck.vy *= 0.995; r.puck.x += r.puck.vx; r.puck.y += r.puck.vy;
            if (r.puck.y < PUCK_R) { r.puck.y = PUCK_R; r.puck.vy *= -1; }
            if (r.puck.y > HEIGHT - PUCK_R) { r.puck.y = HEIGHT - PUCK_R; r.puck.vy *= -1; }
            if (r.puck.x < PUCK_R) { if (r.puck.y > 125 && r.puck.y < 275) handleGoal(r, 'player2'); else { r.puck.x = PUCK_R; r.puck.vx *= -1; } }
            if (r.puck.x > WIDTH - PUCK_R) { if (r.puck.y > 125 && r.puck.y < 275) handleGoal(r, 'player1'); else { r.puck.x = WIDTH - PUCK_R; r.puck.vx *= -1; } }
            resolveCollision(r.puck, r.player1); resolveCollision(r.puck, r.player2);
        }
        io.to(id).emit('gameStateUpdate', { id: r.id, puck: r.puck, player1: r.player1, player2: r.player2, paused: r.paused, gameOver: r.gameOver, timeLeft: r.timeLeft });
    }
}, 20);

// ==========================================
// 4. ОБРАБОТКА СОЕДИНЕНИЙ (SOCKETS)
// ==========================================
function tryRejoin(socket, user) {
    for (const id in rooms) {
        const r = rooms[id]; if (r.gameOver) continue;
        const role = r.player1.name === user.name ? 'player1' : (r.player2.name === user.name ? 'player2' : null);
        if (role && !r[role].id) {
            r[role].id = socket.id; socket.join(id); socket.roomId = id;
            clearTimeout(r.disconnectTimeout); r.reconnectDeadline = null;
            if (r.player1.id && r.player2.id) { r.paused = false; io.to(id).emit('goalNotify', { msg: "", color: "" }); }
            socket.emit('role', role === 'player1' ? 'p1' : 'p2'); return true;
        }
    } return false;
}

io.on('connection', (socket) => {
    // Авторизация
    socket.on('login', async (data, callback) => {
        try {
            const u = await User.findOne({ name: data.name });
            if (!u || !await bcrypt.compare(data.password, u.password)) return callback({ success: false, msg: "Ошибка входа" });
            socket.user = u; connectedUsers[u.name] = socket.id;
            if (tryRejoin(socket, u)) callback({ success: true, rejoining: true });
            else callback({ success: true, rejoining: false });
        } catch(e) { callback({ success: false, msg: "Ошибка сервера" }); }
    });

    socket.on('register', async (data, callback) => {
        try {
            if (await User.findOne({ name: data.name })) return callback({ success: false, msg: "Имя занято" });
            const ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
            const hash = await bcrypt.hash(data.password, 10);
            const u = new User({ name: data.name, password: hash, regIp: ip });
            await u.save(); socket.user = u; connectedUsers[u.name] = socket.id;
            callback({ success: true, rejoining: false });
        } catch(e) { callback({ success: false, msg: "Ошибка регистрации" }); }
    });

    // Профиль и магазин
    socket.on('getProfile', async (cb) => { if (socket.user) { const u = await User.findById(socket.user._id); cb({ success: true, coins: u.coins, skin: u.skin, inventory: u.inventory, reqCount: u.requests.length, isAdmin: u.name === ADMIN_NICKNAME, clanName: u.clan, bpLevel: u.bpLevel, bpXP: u.bpXP, goalEffects: u.goalEffects, currentGoalEffect: u.currentGoalEffect, vsCases: u.vsCases, vsEffects: u.vsEffects, currentVsEffect: u.currentVsEffect }); } });
    
    socket.on('buySkin', async (skin, cb) => {
        if (!socket.user) return;
        const prices = { korzhik: 250, karamelka: 250, kompot: 500, gonya: 500, default: 0 };
        const u = await User.findById(socket.user._id);
        if (u.inventory.includes(skin)) { u.skin = skin; await u.save(); return cb({ success: true }); }
        if (u.coins >= prices[skin]) { u.coins -= prices[skin]; u.inventory.push(skin); u.skin = skin; await u.save(); cb({ success: true }); }
        else cb({ success: false, msg: "Мало монет" });
    });

    socket.on('buyBpItem', async (item, cb) => {
        if (!socket.user) return;
        const u = await User.findById(socket.user._id);
        if (u.bpLevel < 30) return cb({ success: false, msg: "Нужен 30 ур. БП" });
        if (item === 'sazhik' && u.bpXP >= 1500 && !u.inventory.includes('sazhik')) { u.bpXP -= 1500; u.inventory.push('sazhik'); await u.save(); cb({ success: true, msg: "Сажик разблокирован!" }); }
        else if (item === 'matrix' && u.bpXP >= 800 && !u.vsEffects.includes('matrix')) { u.bpXP -= 800; u.vsEffects.push('matrix'); await u.save(); cb({ success: true, msg: "Матрица разблокирована!" }); }
        else cb({ success: false, msg: "Мало XP или уже куплено" });
    });

    // Кланы
    socket.on('createClan', async (d, cb) => {
        if (!socket.user) return;
        const u = await User.findById(socket.user._id);
        if (u.clan || await Clan.findOne({ name: d.name })) return cb({ success: false, msg: "Ошибка" });
        const c = new Clan({ name: d.name, leader: u.name, members: [u.name] });
        await c.save(); u.clan = c.name; await u.save(); cb({ success: true, msg: "Клан создан!" });
    });

    socket.on('sendClanChat', async (msg) => {
        if (!socket.user || !socket.user.clan) return;
        const c = await Clan.findOne({ name: socket.user.clan });
        if (!c) return;
        const m = { name: socket.user.name, msg: msg.substring(0, 100), time: Date.now() };
        c.chat.push(m); if (c.chat.length > 50) c.chat.shift(); await c.save();
        c.members.forEach(mem => { const sid = connectedUsers[mem]; if (sid) io.to(sid).emit('newClanMsg', m); });
    });

    // Турниры (Клиент)
    socket.on('joinTourney', (cb) => {
        if (!socket.user || tourney.state !== 'reg') return cb({ success: false, msg: "Регистрация закрыта" });
        if (tourney.players.includes(socket.user.name)) return cb({ success: false, msg: "Уже в списке" });
        tourney.players.push(socket.user.name);
        cb({ success: true, msg: "Вы в списке участников!" });
        io.emit('tourneyUpdate', { count: tourney.players.length });
    });

    // Админка
    socket.on('adminGetUsers', async (cb) => {
        if (socket.user?.name !== ADMIN_NICKNAME) return;
        const users = await User.find().select('name rating coins regIp').lean();
        cb({ success: true, users, tourneyState: tourney.state, tourneyPlayers: tourney.players.length });
    });

    socket.on('tourneyAdminAction', (act, cb) => {
        if (socket.user?.name !== ADMIN_NICKNAME) return;
        if (act === 'startReg') { resetTourney(); tourney.state = 'reg'; io.emit('tourneyAnnounce', { type: 'reg', msg: "🏆 РЕГИСТРАЦИЯ НА ТУРНИР ОТКРЫТА!" }); cb({ success: true, msg: "Регистрация открыта" }); }
        if (act === 'startMatches') { if (tourney.players.length < 2) return cb({ success: false, msg: "Мало людей" }); tourney.state = 'playing'; startNextTournamentRound(); cb({ success: true, msg: "Турнир начался" }); }
        if (act === 'cancel') { resetTourney(); io.emit('tourneyAnnounce', { type: 'cancel', msg: "❌ Турнир отменен" }); cb({ success: true, msg: "Турнир отменен" }); }
    });

    socket.on('adminAction', async (d, cb) => {
        if (socket.user?.name !== ADMIN_NICKNAME) return;
        const t = await User.findOne({ name: d.targetName });
        if (!t) return cb({ success: false });
        if (d.action === 'addCoins') t.coins += Number(d.amount);
        if (d.action === 'addBpXp') await applyBP(t.name, Number(d.amount), connectedUsers[t.name]);
        if (d.action === 'ban') await User.deleteOne({ name: d.targetName });
        await t.save(); cb({ success: true, msg: "Готово" });
    });

    // Геймплей
    socket.on('play', () => { if (socket.user) joinPlayerToRoom(socket, socket.user); });
    socket.on('playBot', () => {
        if (!socket.user) return;
        const rid = createRoom(true); const r = rooms[rid];
        r.player1 = { id: socket.id, name: socket.user.name, skin: socket.user.skin, x: 80, y: 200, score: 0, rating: socket.user.rating, avatar: socket.user.avatar };
        r.player2 = { id: 'bot', name: "Бот Вася 🤖", skin: "default", x: 720, y: 200, score: 0, rating: "---", avatar: "avatar4" };
        socket.join(rid); socket.roomId = rid; socket.emit('role', 'p1');
        io.to(rid).emit('showVsScreen', { p1: r.player1, p2: r.player2 });
        setTimeout(() => { if (rooms[rid]) rooms[rid].paused = false; }, 3000);
    });

    socket.on('input', (data) => {
        const r = rooms[socket.roomId]; if (!r || r.paused || r.gameOver) return;
        const p = socket.id === r.player1.id ? r.player1 : (socket.id === r.player2.id ? r.player2 : null);
        if (p) {
            const oldX = p.x, oldY = p.y;
            let rad = p.skin === 'kompot' ? 43 : (p.skin === 'gonya' ? 28 : 35);
            let minX = p === r.player1 ? rad : 400 + rad; let maxX = p === r.player1 ? 400 - rad : 800 - rad;
            p.x = Math.min(maxX, Math.max(minX, data.x)); p.y = Math.min(400 - rad, Math.max(rad, data.y));
            p.speedX = p.x - oldX; p.speedY = p.y - oldY;
        }
    });

    socket.on('spectate', (rid) => { if (rooms[rid]) { socket.join(rid); socket.roomId = rid; socket.emit('role', 'spectator'); socket.emit('forceStartGame'); } });

    socket.on('disconnect', () => {
        if (socket.user) delete connectedUsers[socket.user.name];
        const r = rooms[socket.roomId];
        if (r && !r.gameOver) {
            const role = socket.id === r.player1.id ? 'player1' : 'player2';
            r[role].id = null; r.paused = true; r.reconnectDeadline = Date.now() + 60000;
            r.disconnectTimeout = setTimeout(() => finishMatch(r, role === 'player1' ? 'player2' : 'player1', true), 60000);
        }
    });
});

function joinPlayerToRoom(socket, user) {
    let rid = null;
    for (const id in rooms) { if (!rooms[id].gameOver && !rooms[id].isBotMatch && !rooms[id].isFriendly && !rooms[id].isTournament && rooms[id].player1.id && !rooms[id].player2.id) { rid = id; break; } }
    if (!rid) rid = createRoom();
    const r = rooms[rid]; socket.join(rid); socket.roomId = rid;
    if (!r.player1.id) { r.player1.id = socket.id; r.player1.name = user.name; r.player1.rating = user.rating; r.player1.skin = user.skin; r.player1.avatar = user.avatar; socket.emit('role', 'p1'); }
    else {
        r.player2.id = socket.id; r.player2.name = user.name; r.player2.rating = user.rating; r.player2.skin = user.skin; r.player2.avatar = user.avatar; socket.emit('role', 'p2');
        io.to(rid).emit('showVsScreen', { p1: r.player1, p2: r.player2 });
        setTimeout(() => { if (rooms[rid]) rooms[rid].paused = false; }, 3000);
    }
}