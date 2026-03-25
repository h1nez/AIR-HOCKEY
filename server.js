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
// 1. НАСТРОЙКИ СЕРВЕРА И ФИКС ДЛЯ RENDER
// ==========================================
const PORT = process.env.PORT || 10000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:davidik12@aerohockey.5bidt7s.mongodb.net/';
const ADMIN_NICKNAME = "davidik12"; // Замени на свой ник

// Важно для Render: сначала открываем порт, потом подключаем базу
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущен и слушает порт ${PORT}`);
});

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ База данных MongoDB успешно подключена!'))
    .catch(err => console.error('❌ Ошибка подключения к БД:', err.message));

// ==========================================
// 2. СХЕМЫ БАЗЫ ДАННЫХ (MONGOOSE)
// ==========================================
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
    title: { type: String, default: '' },
    
    // Боевой пропуск и эффекты
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
    leader: { type: String, required: true },
    members: { type: [String], default: [] },
    chat: { type: Array, default: [] }
});
const Clan = mongoose.model('Clan', clanSchema);

const connectedUsers = {}; 

// ==========================================
// 3. СИСТЕМА ТУРНИРОВ И КОМНАТЫ
// ==========================================
let tourney = {
    state: 'idle',    // 'idle', 'reg', 'playing'
    players: [],      // Ники участников
    winners: [],      // Победители раунда
    matchesActive: 0, // Количество идущих матчей турнира
    round: 1
};

function resetTourney() {
    tourney = { state: 'idle', players: [], winners: [], matchesActive: 0, round: 1 };
}

app.use(express.static(path.join(__dirname, 'public')));

// Константы игрового поля
const WIDTH = 800; 
const HEIGHT = 400; 
const PUCK_R = 22;

const rooms = {}; 
let roomCounter = 1;

function createRoom(isBotMatch = false, isFriendly = false, isTournament = false) {
    const roomId = 'room_' + roomCounter++;
    rooms[roomId] = {
        id: roomId, 
        puck: { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 },
        player1: { 
            id: null, ip: null, name: "...", skin: "default", 
            x: 80, y: 200, score: 0, rating: 1000, 
            speedX: 0, speedY: 0, avatar: "avatar1", vsEffect: "none" 
        },
        player2: { 
            id: null, ip: null, name: "...", skin: "default", 
            x: 720, y: 200, score: 0, rating: 1000, 
            speedX: 0, speedY: 0, avatar: "avatar1", vsEffect: "none" 
        },
        paused: true, 
        gameOver: false, 
        isBotMatch: isBotMatch, 
        isFriendly: isFriendly, 
        isTournament: isTournament,
        rematch: { player1: false, player2: false }, 
        botTimer: null
    };
    return roomId;
}

// ==========================================
// 4. ФИЗИКА И СТОЛКНОВЕНИЯ
// ==========================================
function resolveCollision(puck, player) {
    let pR = 35; 
    let res = 1.6; // Упругость отскока
    let pMaxSpeed = 28; 
    
    // Применяем баффы скинов
    if (player.skin === 'kompot') pR = 43; 
    if (player.skin === 'gonya') pR = 28; 
    if (player.skin === 'korzhik') res = 1.9; 
    if (player.skin === 'karamelka') pMaxSpeed = 35; 
    if (player.skin === 'sazhik') { 
        pR = 35; 
        res = 2.0; 
        pMaxSpeed = 32; 
    } 

    const dx = puck.x - player.x; 
    const dy = puck.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy); 
    const minDist = PUCK_R + pR;
    
    if (dist < minDist) {
        // Выталкиваем шайбу из игрока, чтобы не застревала
        let nx = dx / dist; 
        let ny = dy / dist; 
        puck.x = player.x + nx * (minDist + 0.1); 
        puck.y = player.y + ny * (minDist + 0.1);
        
        // Векторная математика отскока
        const relVX = puck.vx - player.speedX; 
        const relVY = puck.vy - player.speedY;
        const velNormal = relVX * nx + relVY * ny;
        
        if (velNormal > 0) return; // Уже разлетаются
        
        const impulse = -(1 + res) * velNormal;
        puck.vx += impulse * nx + (player.speedX * 0.8); 
        puck.vy += impulse * ny + (player.speedY * 0.8);
        
        // Ограничение скорости шайбы
        const speed = Math.sqrt(puck.vx**2 + puck.vy**2);
        if (speed > pMaxSpeed) { 
            puck.vx = (puck.vx / speed) * pMaxSpeed; 
            puck.vy = (puck.vy / speed) * pMaxSpeed; 
        }
    }
}

// ==========================================
// 5. ГЛАВНЫЙ ИГРОВОЙ ЦИКЛ (20ms / 50 FPS)
// ==========================================
setInterval(() => {
    for (const id in rooms) {
        const r = rooms[id];
        
        if (!r.paused && !r.gameOver) {
            
            // --- ЛОГИКА БОТА ---
            if (r.player2.id && r.player2.id.includes('bot')) {
                const bot = r.player2; 
                const oldY = bot.y;
                let ty = r.puck.y; 
                const speed = r.player2.id === 'secret_bot' ? 7.8 : 6.2;
                
                if (bot.y < ty - speed) bot.y += speed; 
                else if (bot.y > ty + speed) bot.y -= speed;
                
                bot.y = Math.max(35, Math.min(365, bot.y)); 
                bot.speedY = bot.y - oldY; 
                bot.speedX = 0;
            }

            // --- ФИЗИКА ШАЙБЫ ---
            r.puck.vx *= 0.995; // Трение
            r.puck.vy *= 0.995; 
            r.puck.x += r.puck.vx; 
            r.puck.y += r.puck.vy;

            // Отскоки от верхних/нижних стен
            if (r.puck.y < PUCK_R || r.puck.y > HEIGHT - PUCK_R) {
                r.puck.vy *= -1;
                // Держим в границах
                if (r.puck.y < PUCK_R) r.puck.y = PUCK_R;
                if (r.puck.y > HEIGHT - PUCK_R) r.puck.y = HEIGHT - PUCK_R;
            }

            // Отскоки от левой стены и Гол
            if (r.puck.x < PUCK_R) { 
                if (r.puck.y > 125 && r.puck.y < 275) {
                    handleGoal(r, 'player2'); 
                } else { 
                    r.puck.x = PUCK_R; 
                    r.puck.vx *= -1; 
                } 
            }

            // Отскоки от правой стены и Гол
            if (r.puck.x > WIDTH - PUCK_R) { 
                if (r.puck.y > 125 && r.puck.y < 275) {
                    handleGoal(r, 'player1'); 
                } else { 
                    r.puck.x = WIDTH - PUCK_R; 
                    r.puck.vx *= -1; 
                } 
            }

            // Проверка столкновений шайбы с игроками
            resolveCollision(r.puck, r.player1); 
            resolveCollision(r.puck, r.player2);
        }

        // Отправка состояния комнаты всем её участникам
        io.to(id).emit('gameStateUpdate', r);
    }
}, 20);

// ==========================================
// 6. ОБРАБОТКА ГОЛОВ, ОПЫТА И ЭЛО
// ==========================================
async function applyBP(userName, xpAdded) {
    if (userName === "..." || userName.includes("bot")) return;
    try {
        const u = await User.findOne({ name: userName });
        if (!u) return;
        
        u.bpXP += xpAdded;
        while (u.bpXP >= 100 && u.bpLevel < 30) { 
            u.bpXP -= 100; 
            u.bpLevel++; 
            u.coins += 50; 
        }
        await u.save();
    } catch(e) {
        console.error("Ошибка начисления BP:", e);
    }
}

async function handleGoal(room, winRole) {
    room.paused = true; 
    
    // Возвращаем игроков на исходные позиции
    room.player1.x = 80; room.player1.y = 200; 
    room.player2.x = 720; room.player2.y = 200;
    
    const win = winRole === 'player1' ? room.player1 : room.player2; 
    const lose = winRole === 'player1' ? room.player2 : room.player1;
    win.score++;
    
    // Если кто-то набрал 5 очков — матч окончен
    if (win.score >= 5) {
        room.gameOver = true;
        
        // Логика турнирного матча
        if (room.isTournament) {
            tourney.matchesActive--;
            if (win.id && !win.id.includes('bot')) {
                tourney.winners.push(win.name);
            }
            io.to(room.id).emit('goalNotify', { msg: `ТУРНИР: ПОБЕДА ${win.name}!`, color: "gold" });
            
            // Если все матчи раунда сыграны, запускаем следующий
            if (tourney.matchesActive <= 0) {
                setTimeout(startNextTournamentRound, 3000);
            }
        } 
        // Логика обычного матча
        else {
            await applyBP(win.name, 50); 
            await applyBP(lose.name, 20);
            
            if (win.id && !win.id.includes('bot')) {
                try {
                    const u1 = await User.findOne({name: win.name}); 
                    const u2 = await User.findOne({name: lose.name});
                    
                    if (u1 && u2) {
                        // Расчет рейтинга ЭЛО
                        const K = 32; 
                        const exp = 1 / (1 + Math.pow(10, (u2.rating - u1.rating) / 400));
                        const diff = Math.round(K * (1 - exp));
                        
                        u1.rating += diff; 
                        u2.rating -= diff; 
                        u1.coins += 25; 
                        u2.coins += 5;
                        
                        await u1.save(); 
                        await u2.save();
                    }
                } catch(e) { console.error(e); }
            }
            io.to(room.id).emit('goalNotify', { msg: `ПОБЕДИТЕЛЬ: ${win.name}`, color: "gold" });
        }
        
        setTimeout(() => io.to(room.id).emit('showEndScreen'), 2000);
    } 
    // Обычный гол (игра продолжается)
    else {
        io.to(room.id).emit('goalNotify', { 
            msg: `ГОЛ: ${win.name}`, 
            color: winRole === 'player1' ? '#4da6ff' : '#ff4d4d' 
        });
        
        setTimeout(() => { 
            if (rooms[room.id] && !rooms[room.id].gameOver) { 
                rooms[room.id].puck = { x: 400, y: 200, vx: 0, vy: 0 }; 
                rooms[room.id].paused = false; 
                io.to(room.id).emit('goalNotify', { msg: "", color: "" }); 
            } 
        }, 2000);
    }
}

// ==========================================
// 7. АВТОМАТИЗАЦИЯ ТУРНИРНОЙ СЕТКИ
// ==========================================
async function startNextTournamentRound() {
    tourney.players = [...tourney.winners]; 
    tourney.winners = [];
    
    // Если остался один игрок — он чемпион
    if (tourney.players.length === 1) {
        const championName = tourney.players[0];
        io.emit('tourneyAnnounce', { type: 'end', msg: `🏆 ТУРНИР ОКОНЧЕН! Чемпион: ${championName}!` });
        
        try {
            const u = await User.findOne({name: championName}); 
            if(u){ 
                u.coins += 1000; 
                u.title = "Чемпион 🏆"; 
                await u.save(); 
            }
        } catch(e) { console.error(e); }
        
        resetTourney(); 
        return;
    }
    
    // Защита от пустого турнира
    if (tourney.players.length === 0) { 
        resetTourney(); 
        return; 
    }
    
    tourney.round++; 
    // Перемешиваем игроков
    let shuffled = tourney.players.sort(() => 0.5 - Math.random()); 
    tourney.matchesActive = 0;
    
    // Разбиваем на пары
    for (let i = 0; i < shuffled.length; i += 2) {
        if (i + 1 < shuffled.length) {
            setupTournamentMatch(shuffled[i], shuffled[i+1]);
        } else { 
            // Игроку не хватило пары, авто-проход
            tourney.winners.push(shuffled[i]); 
            const s = connectedUsers[shuffled[i]]; 
            if(s) io.to(s).emit('tourneyMsg', "Вам не досталось противника. Авто-проход дальше!"); 
        }
    }
    
    // Если все матчи были авто-проходами
    if (tourney.matchesActive === 0 && tourney.winners.length > 0) {
        startNextTournamentRound();
    }
}

async function setupTournamentMatch(p1n, p2n) {
    const s1 = connectedUsers[p1n];
    const s2 = connectedUsers[p2n];
    
    // Проверка на оффлайн
    if (!s1 && !s2) return; 
    if (!s1) { tourney.winners.push(p2n); return; } 
    if (!s2) { tourney.winners.push(p1n); return; }
    
    try {
        const u1 = await User.findOne({name: p1n}).lean();
        const u2 = await User.findOne({name: p2n}).lean();
        
        const rid = createRoom(false, false, true); // isTournament = true
        const r = rooms[rid];
        
        // Подключаем сокеты к комнате
        [s1, s2].forEach((s, i) => { 
            const sock = io.sockets.sockets.get(s); 
            if(sock){ 
                sock.leave(sock.roomId); 
                sock.join(rid); 
                sock.roomId = rid; 
                sock.emit('role', i === 0 ? 'p1' : 'p2'); 
            }
        });
        
        r.player1 = { id: s1, name: u1.name, skin: u1.skin, x: 80, y: 200, score: 0, rating: u1.rating, avatar: u1.avatar, vsEffect: u1.currentVsEffect };
        r.player2 = { id: s2, name: u2.name, skin: u2.skin, x: 720, y: 200, score: 0, rating: u2.rating, avatar: u2.avatar, vsEffect: u2.currentVsEffect };
        
        tourney.matchesActive++; 
        r.paused = true;
        
        io.to(rid).emit('showVsScreen', { p1: r.player1, p2: r.player2 });
        setTimeout(() => { if(rooms[rid]) rooms[rid].paused = false; }, 3500);
        
    } catch(e) { console.error("Ошибка турнирного матча:", e); }
}

// ==========================================
// 8. ОБРАБОТКА ПОДКЛЮЧЕНИЙ КЛИЕНТОВ
// ==========================================
io.on('connection', (socket) => {
    
    // --- АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ ---
    socket.on('login', async (data, cb) => {
        try {
            const u = await User.findOne({ name: data.name });
            if (!u || !await bcrypt.compare(data.password, u.password)) {
                return cb({ success: false, msg: "Неверный логин или пароль" });
            }
            socket.user = u; 
            connectedUsers[u.name] = socket.id; 
            cb({ success: true });
        } catch(e) { cb({ success: false, msg: "Ошибка сервера" }); }
    });

    socket.on('register', async (data, cb) => {
        try {
            if (await User.findOne({ name: data.name })) {
                return cb({ success: false, msg: "Никнейм уже занят" });
            }
            const hash = await bcrypt.hash(data.password, 10);
            const u = new User({ 
                name: data.name, 
                password: hash, 
                regIp: socket.handshake.address 
            });
            await u.save(); 
            socket.user = u; 
            connectedUsers[u.name] = socket.id; 
            cb({ success: true });
        } catch(e) { cb({ success: false, msg: "Ошибка сервера" }); }
    });

    // --- ПРОФИЛЬ И МАГАЗИН ---
    socket.on('getProfile', async (cb) => {
        if (!socket.user) return;
        try {
            const u = await User.findById(socket.user._id).lean();
            cb({ 
                success: true, 
                ...u, 
                isAdmin: u.name === ADMIN_NICKNAME, 
                reqCount: u.requests.length 
            });
        } catch(e) { cb({ success: false }); }
    });

    socket.on('buySkin', async (skin, cb) => {
        if (!socket.user) return;
        const prices = { korzhik: 250, karamelka: 250, kompot: 500, gonya: 500, default: 0 };
        try {
            const u = await User.findById(socket.user._id);
            if (u.inventory.includes(skin)) { 
                u.skin = skin; 
                await u.save(); 
                return cb({ success: true }); 
            }
            if (u.coins >= prices[skin]) { 
                u.coins -= prices[skin]; 
                u.inventory.push(skin); 
                u.skin = skin; 
                await u.save(); 
                cb({ success: true }); 
            } else {
                cb({ success: false, msg: "Недостаточно монет" });
            }
        } catch(e) { cb({ success: false }); }
    });

    socket.on('buyBpItem', async (item, cb) => {
        if (!socket.user) return;
        try {
            const u = await User.findById(socket.user._id);
            if (u.bpLevel < 30) return cb({ success: false, msg: "Требуется 30 уровень БП!" });
            
            if (item === 'sazhik' && u.bpXP >= 1500 && !u.inventory.includes('sazhik')) { 
                u.bpXP -= 1500; 
                u.inventory.push('sazhik'); 
                await u.save(); 
                cb({ success: true, msg: "Сажик разблокирован!" }); 
            } else if (item === 'matrix' && u.bpXP >= 800 && !u.vsEffects.includes('matrix')) { 
                u.bpXP -= 800; 
                u.vsEffects.push('matrix'); 
                await u.save(); 
                cb({ success: true, msg: "Эффект Матрица получен!" }); 
            } else {
                cb({ success: false, msg: "Не хватает XP или уже куплено" });
            }
        } catch(e) { cb({ success: false }); }
    });

    // --- УПРАВЛЕНИЕ ТУРНИРОМ ---
    socket.on('joinTourney', (cb) => {
        if (!socket.user) return;
        if (tourney.state !== 'reg') return cb({ success: false, msg: "Регистрация закрыта" });
        if (!tourney.players.includes(socket.user.name)) {
            tourney.players.push(socket.user.name);
        }
        cb({ success: true, msg: "Вы записаны на турнир!" });
    });

    socket.on('tourneyAdminAction', (act, cb) => {
        if (socket.user?.name !== ADMIN_NICKNAME) return;
        if (act === 'startReg') { 
            resetTourney(); 
            tourney.state = 'reg'; 
            io.emit('tourneyAnnounce', { type: 'reg', msg: "🏆 РЕГИСТРАЦИЯ НА ТУРНИР ОТКРЫТА!" }); 
        }
        if (act === 'startMatches') { 
            if (tourney.players.length < 2) return cb({success: false, msg: "Мало игроков"});
            tourney.state = 'playing'; 
            startNextTournamentRound(); 
        }
        if (act === 'cancel') { 
            resetTourney(); 
            io.emit('tourneyAnnounce', { type: 'cancel', msg: "❌ Турнир отменен." }); 
        }
        cb({ success: true });
    });

    // --- АДМИН-ПАНЕЛЬ ---
    socket.on('adminGetUsers', async (cb) => {
        if (socket.user?.name !== ADMIN_NICKNAME) return;
        try {
            const users = await User.find().select('name rating coins regIp clan').lean();
            cb({ 
                success: true, 
                users, 
                tourneyState: tourney.state, 
                tourneyPlayers: tourney.players.length 
            });
        } catch(e) { cb({ success: false }); }
    });
    
    socket.on('adminAction', async (data, cb) => {
        if (socket.user?.name !== ADMIN_NICKNAME) return;
        try {
            if (data.action === 'ban') { 
                await User.deleteOne({ name: data.targetName }); 
                const sid = connectedUsers[data.targetName]; 
                if(sid) io.to(sid).emit('forceReload'); 
            }
            if (data.action === 'addCoins') { 
                const u = await User.findOne({name: data.targetName}); 
                if(u) { u.coins += Number(data.amount); await u.save(); } 
            }
            cb({ success: true });
        } catch(e) { cb({ success: false }); }
    });

    // --- ПОИСК ИГРЫ И МАТЧМЕЙКИНГ ---
    socket.on('play', () => {
        if(!socket.user) return;
        let rid = null;
        let ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || "";
        ip = ip.split(',')[0].trim();

        // Ищем пустую комнату
        for (const id in rooms) { 
            const r = rooms[id];
            // Не подключаем к ботам, турнирам и игрокам с таким же IP
            if (!r.gameOver && !r.isBotMatch && !r.isTournament && r.player1.id && !r.player2.id && r.player1.ip !== ip) { 
                rid = id; 
                break; 
            } 
        }

        if (!rid) {
            // Создаем новую комнату
            rid = createRoom(); 
            const r = rooms[rid]; 
            socket.join(rid); 
            socket.roomId = rid;
            
            r.player1 = { 
                id: socket.id, ip, name: socket.user.name, 
                skin: socket.user.skin, x: 80, y: 200, score: 0, 
                rating: socket.user.rating, avatar: socket.user.avatar, vsEffect: socket.user.currentVsEffect 
            };
            socket.emit('role', 'p1');
            
            // Запускаем таймер на секретного бота (если никто не зайдет за 10 сек)
            r.botTimer = setTimeout(() => {
                if (r.player1.id && !r.player2.id) {
                    r.player2 = { 
                        id: 'secret_bot', name: 'S1mple', skin: 'default', 
                        x: 720, y: 200, score: 0, rating: r.player1.rating + 15, 
                        avatar: 'avatar4', vsEffect: 'neon' 
                    };
                    io.to(rid).emit('showVsScreen', { p1: r.player1, p2: r.player2 }); 
                    setTimeout(() => r.paused = false, 3500);
                }
            }, 10000);
        } else {
            // Подключаемся вторым игроком
            const r = rooms[rid]; 
            socket.join(rid); 
            socket.roomId = rid; 
            
            if (r.botTimer) clearTimeout(r.botTimer);
            
            r.player2 = { 
                id: socket.id, ip, name: socket.user.name, 
                skin: socket.user.skin, x: 720, y: 200, score: 0, 
                rating: socket.user.rating, avatar: socket.user.avatar, vsEffect: socket.user.currentVsEffect 
            };
            socket.emit('role', 'p2');
            
            io.to(rid).emit('showVsScreen', { p1: r.player1, p2: r.player2 }); 
            setTimeout(() => r.paused = false, 3500);
        }
    });

    // --- ГЕЙМПЛЕЙ И УПРАВЛЕНИЕ ---
    socket.on('input', (data) => {
        const r = rooms[socket.roomId]; 
        if(!r || r.paused || r.gameOver) return;
        
        const p = socket.id === r.player1.id ? r.player1 : (socket.id === r.player2.id ? r.player2 : null);
        if(p) { 
            p.speedX = data.x - p.x; 
            p.speedY = data.y - p.y; 
            p.x = data.x; 
            p.y = data.y; 
        }
    });
    
    // --- БЫСТРЫЕ ФРАЗЫ (QUICK CHAT) ---
    socket.on('sendQuickChat', (txt) => {
        const r = rooms[socket.roomId]; 
        if(!r) return;
        const role = socket.id === r.player1.id ? 'p1' : 'p2';
        io.to(socket.roomId).emit('showQuickChat', { text: txt, role });
    });

    // --- ВЫХОД И ОТКЛЮЧЕНИЕ ---
    socket.on('leaveMatch', () => {
        const r = rooms[socket.roomId]; 
        if(r && !r.gameOver) { 
            r.gameOver = true; 
            const win = socket.id === r.player1.id ? 'player2' : 'player1'; 
            handleGoal(r, win); 
        }
        socket.leave(socket.roomId); 
        socket.roomId = null;
    });

    socket.on('disconnect', () => {
        if(socket.user) delete connectedUsers[socket.user.name];
        const r = rooms[socket.roomId]; 
        if(r && !r.gameOver) { 
            r.gameOver = true; 
            const win = socket.id === r.player1.id ? 'player2' : 'player1'; 
            handleGoal(r, win); 
        }
    });
});