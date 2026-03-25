const socket = io();

// ==========================================
// 🔥 ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И МАГАЗИН
// ==========================================
let userInventory = ['default'];
let userCurrentSkin = 'default';
let shopIndex = 0;
let myQuickChats = []; // Сохраняем фразы игрока

const shopItems = [
    { id: 'default', name: 'Обычный', boost: 'Нет бонусов', price: 0, color: '#4da6ff' },
    { id: 'korzhik', name: 'Коржик', boost: 'Сильный удар', price: 250, color: '#fb8500' },
    { id: 'karamelka', name: 'Карамелька', boost: 'Супер-скорость', price: 250, color: '#e63946' },
    { id: 'kompot', name: 'Компот', boost: 'Большая клюшка', price: 500, color: '#06d6a0' },
    { id: 'gonya', name: 'Гоня 👽', boost: 'Меткий и бешеный!', price: 500, color: '#8338ec' },
    { id: 'sazhik', name: 'Сажик 🐈‍⬛', boost: 'Эндгейм Мастер!', price: 999999, color: '#2b2d42' } // Только из БП!
];

// ==========================================
// 🔥 АССЕТЫ И ЗВУКИ
// ==========================================
const catImages = {
    'korzhik': new Image(),
    'karamelka': new Image(),
    'kompot': new Image(),
    'gonya': new Image(),
    'sazhik': new Image()
};
catImages.korzhik.src = '/korzhik.png';
catImages.karamelka.src = '/karamelka.png';
catImages.kompot.src = '/kompot.png';
catImages.gonya.src = '/gonya.png';
catImages.sazhik.src = '/sazhik.png';

const sndHit = new Audio('/hit.mp3');
const sndWall = new Audio('/wall.mp3');
const sndGoalWin = new Audio('/goal_win.mp3');
const sndGoalLose = new Audio('/goal_lose.mp3');

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
window.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
});

function playPop() {
    if (audioCtx.state === 'suspended') return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

function playSound(audioObj) {
    if (!audioObj.src || audioObj.src.includes('undefined')) return;
    const clone = audioObj.cloneNode();
    clone.volume = 0.5;
    clone.play().catch(() => {});
}

function playHit() { playSound(sndHit); }
function playWall() { playSound(sndWall); }
function playGoalWin() { playSound(sndGoalWin); }
function playGoalLose() { playSound(sndGoalLose); }

// ==========================================
// 🔥 ВИЗУАЛЬНЫЕ ЭФФЕКТЫ (КОНФЕТТИ И ЭМОДЗИ)
// ==========================================
let puckTrail = [];
let confetti = [];
let activeEmojis = [];
let activeQuickChats = [];

function getLvlHtml(elo) {
    let lvl = 1, cls = 'lvl-1';
    if (elo >= 800 && elo < 900) { lvl = 2; cls = 'lvl-2'; }
    else if (elo >= 900 && elo < 1000) { lvl = 3; cls = 'lvl-3'; }
    else if (elo >= 1000 && elo < 1100) { lvl = 4; cls = 'lvl-4'; }
    else if (elo >= 1100 && elo < 1200) { lvl = 5; cls = 'lvl-5'; }
    else if (elo >= 1200 && elo < 1300) { lvl = 6; cls = 'lvl-6'; }
    else if (elo >= 1300 && elo < 1400) { lvl = 7; cls = 'lvl-7'; }
    else if (elo >= 1400 && elo < 1500) { lvl = 8; cls = 'lvl-8'; }
    else if (elo >= 1500 && elo < 1600) { lvl = 9; cls = 'lvl-9'; }
    else if (elo >= 1600) { lvl = 10; cls = 'lvl-10'; }
    return `<span class="lvl-badge ${cls}">${lvl}</span>`;
}

function spawnConfetti(type = 'default') {
    confetti = [];
    for (let i = 0; i < 150; i++) {
        let color, vx, vy, size;

        if (type === 'fire') {
            color = `hsl(${Math.random() * 40 + 10}, 100%, 50%)`;
            vx = (Math.random() - 0.5) * 20;
            vy = (Math.random() * -20) - 5;
            size = Math.random() * 12 + 5;
        } else if (type === 'blackhole') {
            color = `hsl(${Math.random() * 60 + 260}, 100%, 60%)`;
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 300 + 100;
            const px = 400 + Math.cos(angle) * dist;
            const py = 200 + Math.sin(angle) * dist;
            vx = 0; vy = 0;
            size = Math.random() * 6 + 3;
            confetti.push({ x: px, y: py, vx, vy, color, size, life: 1.5, type });
            continue;
        } else if (type === 'ice') {
            color = `hsl(${Math.random() * 40 + 180}, 100%, 80%)`;
            vx = (Math.random() - 0.5) * 40;
            vy = (Math.random() - 0.5) * 40;
            size = Math.random() * 8 + 4;
        } else {
            color = `hsl(${Math.random() * 360}, 100%, 50%)`;
            vx = (Math.random() - 0.5) * 25;
            vy = (Math.random() - 0.5) * 25;
            size = Math.random() * 8 + 4;
        }

        confetti.push({ x: 400, y: 200, vx, vy, color, size, life: 1, type });
    }
}

// ==========================================
// 🔥 АВТОРИЗАЦИЯ
// ==========================================
const authScreen = document.getElementById('auth-screen');
const mainMenu = document.getElementById('main-menu');
const gameWrapper = document.getElementById('game-wrapper');
const nameInput = document.getElementById('username');
const passInput = document.getElementById('password');
const rememberCb = document.getElementById('remember');
const authError = document.getElementById('auth-error');

const savedName = localStorage.getItem('ah_name');
const savedPass = localStorage.getItem('ah_pass');

if (savedName && savedPass) {
    nameInput.value = savedName;
    passInput.value = savedPass;
    authError.innerText = "Автоматический вход...";
    authError.style.color = "#4da6ff";

    const doAutoLogin = () => {
        socket.emit('login', { name: savedName, password: savedPass }, handleAuthResponse);
    };

    if (socket.connected) {
        doAutoLogin();
    } else {
        socket.on('connect', doAutoLogin);
    }
}

document.getElementById('btn-login').onclick = () => {
    authError.innerText = "Подключение...";
    authError.style.color = "#e63946";
    socket.emit('login', { name: nameInput.value, password: passInput.value }, handleAuthResponse);
};

document.getElementById('btn-register').onclick = () => {
    authError.innerText = "Создание...";
    authError.style.color = "#e63946";
    socket.emit('register', { name: nameInput.value, password: passInput.value }, handleAuthResponse);
};

function handleAuthResponse(res) {
    if (res.success) {
        authScreen.style.display = 'none';
        if (res.rejoining) {
            mainMenu.style.display = 'none';
            gameWrapper.style.display = 'flex';
            document.getElementById('btn-cancel-search').style.display = 'none';
        } else {
            mainMenu.style.display = 'flex';
        }

        updateProfile();

        if (rememberCb.checked) {
            localStorage.setItem('ah_name', nameInput.value);
            localStorage.setItem('ah_pass', passInput.value);
        } else {
            localStorage.removeItem('ah_name');
            localStorage.removeItem('ah_pass');
        }
    } else {
        authScreen.style.display = 'flex';
        authError.innerText = res.msg;
    }
}

// ==========================================
// 🔥 ГЛОБАЛЬНЫЙ ЧАТ
// ==========================================
const chatContainer = document.getElementById('global-chat');
const chatHeader = document.getElementById('chat-header');
const chatToggleIcon = document.getElementById('chat-toggle-icon');
const chatInput = document.getElementById('chat-input');
const chatMsgs = document.getElementById('chat-messages');

chatHeader.onclick = () => {
    chatContainer.classList.toggle('collapsed');
    if (chatContainer.classList.contains('collapsed')) {
        chatToggleIcon.innerText = '▲';
    } else {
        chatToggleIcon.innerText = '▼';
        chatMsgs.scrollTop = chatMsgs.scrollHeight;
    }
};

document.getElementById('btn-send-chat').onclick = sendChat;
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChat();
});

function sendChat() {
    const msg = chatInput.value.trim();
    if (msg) {
        socket.emit('globalChat', msg);
        chatInput.value = '';
    }
}

socket.on('chatMessage', (data) => {
    const el = document.createElement('div');
    const isMe = data.name.includes(nameInput.value);
    const nameColor = isMe ? '#4da6ff' : '#ffb703';

    el.innerHTML = `<b style="color: ${nameColor};">${data.name}:</b> <span style="color: #333;">${data.msg}</span>`;
    chatMsgs.appendChild(el);

    setTimeout(() => {
        chatMsgs.scrollTop = chatMsgs.scrollHeight;
    }, 50);
});

// ==========================================
// 🔥 МАГАЗИН СКИНОВ
// ==========================================
function renderShopItem() {
    const item = shopItems[shopIndex];
    document.getElementById('shop-item-name').innerText = item.name;
    document.getElementById('shop-item-boost').innerText = item.boost;
    const border = document.getElementById('shop-item-preview-border');
    const img = document.getElementById('shop-item-preview');
    const text = document.getElementById('shop-item-preview-text');
    border.style.borderColor = item.color;
    
    if (item.id === 'default') {
        img.style.display = 'none'; text.style.display = 'block'; border.style.background = item.color;
    } else {
        img.style.display = 'block'; text.style.display = 'none'; img.src = `/${item.id}.png`; border.style.background = '#f4faff';
    }
    
    const actionBtn = document.getElementById('btn-shop-action');
    const priceText = document.getElementById('shop-item-price');
    
    if (userCurrentSkin === item.id) {
        priceText.innerText = "Надето"; priceText.style.color = "#219ebc";
        actionBtn.innerText = "ВЫБРАНО"; actionBtn.className = "btn btn-blue"; actionBtn.disabled = true;
    } else if (userInventory.includes(item.id)) {
        priceText.innerText = "В инвентаре"; priceText.style.color = "#06d6a0";
        actionBtn.innerText = "НАДЕТЬ"; actionBtn.className = "btn btn-green"; actionBtn.disabled = false;
        actionBtn.onclick = () => window.buySkin(item.id);
    } else {
        if (item.id === 'sazhik') {
            priceText.innerText = "Только в Темном Рынке!"; priceText.style.color = "#ef233c";
            actionBtn.innerText = "ЗАКРЫТО"; actionBtn.className = "btn btn-red"; actionBtn.disabled = true;
        } else {
            priceText.innerText = item.price > 0 ? `${item.price} монет` : "Бесплатно"; priceText.style.color = "#fb8500";
            actionBtn.innerText = "КУПИТЬ"; actionBtn.className = "btn btn-orange"; actionBtn.disabled = false;
            actionBtn.onclick = () => window.buySkin(item.id);
        }
    }
}

document.getElementById('btn-shop-prev').onclick = () => { shopIndex = (shopIndex - 1 + shopItems.length) % shopItems.length; document.getElementById('shop-error').innerText = ""; renderShopItem(); };
document.getElementById('btn-shop-next').onclick = () => { shopIndex = (shopIndex + 1) % shopItems.length; document.getElementById('shop-error').innerText = ""; renderShopItem(); };
window.buySkin = function(skinName) { socket.emit('buySkin', skinName, (res) => { if (res.success) { document.getElementById('shop-error').innerText = ""; updateProfile(); } else { document.getElementById('shop-error').innerText = res.msg; } }); };
document.getElementById('btn-shop').onclick = () => { updateProfile(); document.getElementById('shop-modal').style.display = 'flex'; };
document.getElementById('btn-close-shop').onclick = () => { document.getElementById('shop-modal').style.display = 'none'; };

// ==========================================
// 🔥 ИГРОВОЕ МЕНЮ И ЛОББИ
// ==========================================
document.getElementById('btn-play-menu').onclick = () => { document.getElementById('play-modal').style.display = 'flex'; };
document.getElementById('btn-close-play-modal').onclick = () => { document.getElementById('play-modal').style.display = 'none'; };
document.getElementById('btn-play').onclick = () => { document.getElementById('play-modal').style.display = 'none'; mainMenu.style.display = 'none'; gameWrapper.style.display = 'flex'; socket.emit('play'); document.getElementById('goal-msg').textContent = "Ищем друга..."; document.getElementById('goal-msg').style.color = "#fb8500"; document.getElementById('btn-cancel-search').style.display = 'block'; document.getElementById('btn-in-game-quit').style.display = 'none'; };
document.getElementById('btn-play-bot').onclick = () => { document.getElementById('play-modal').style.display = 'none'; mainMenu.style.display = 'none'; gameWrapper.style.display = 'flex'; socket.emit('playBot'); document.getElementById('goal-msg').textContent = ""; document.getElementById('btn-cancel-search').style.display = 'none'; document.getElementById('btn-in-game-quit').style.display = 'block'; };
document.getElementById('btn-cancel-search').onclick = () => { socket.emit('cancelPlay'); gameWrapper.style.display = 'none'; mainMenu.style.display = 'flex'; updateProfile(); document.getElementById('btn-cancel-search').style.display = 'none'; document.getElementById('goal-msg').textContent = ""; };

document.getElementById('btn-in-game-quit').onclick = () => {
    if (!serverState) return;
    if (myRole === 'spectator') { socket.emit('leaveMatch'); clientState = null; serverState = null; myRole = null; activeEmojis = []; activeQuickChats = []; document.getElementById('game-wrapper').style.display = 'none'; document.getElementById('end-screen').style.display = 'none'; document.getElementById('btn-in-game-quit').style.display = 'none'; document.getElementById('main-menu').style.display = 'flex'; updateProfile(); return; }
    
    const isBot = serverState.isBotMatch; const isFriendly = serverState.isFriendly; const isTourney = serverState.isTournament;
    let msg = "Вы уверены, что хотите выйти?\n\nВам будет засчитано ПОРАЖЕНИЕ и снято ЭЛО!";
    if (isBot) msg = "Вы уверены, что хотите прервать тренировку?"; 
    if (isFriendly) msg = "Вы уверены, что хотите покинуть дружеский матч?";
    if (isTourney) msg = "Вы уверены, что хотите покинуть турнир? Вы вылетите из сетки!";
    
    if (confirm(msg)) { socket.emit('leaveMatch'); clientState = null; serverState = null; myRole = null; activeEmojis = []; activeQuickChats = []; document.getElementById('game-wrapper').style.display = 'none'; document.getElementById('end-screen').style.display = 'none'; document.getElementById('btn-in-game-quit').style.display = 'none'; document.getElementById('main-menu').style.display = 'flex'; updateProfile(); }
};

socket.on('showEndScreen', () => { document.getElementById('end-screen').style.display = 'flex'; document.getElementById('btn-in-game-quit').style.display = 'none'; });
socket.on('hideEndScreen', () => { document.getElementById('end-screen').style.display = 'none'; confetti = []; activeEmojis = []; activeQuickChats = []; });
socket.on('opponentLeft', () => { socket.emit('leaveMatch'); clientState = null; serverState = null; myRole = null; activeEmojis = []; activeQuickChats = []; document.getElementById('game-wrapper').style.display = 'none'; document.getElementById('end-screen').style.display = 'none'; document.getElementById('btn-in-game-quit').style.display = 'none'; document.getElementById('main-menu').style.display = 'flex'; updateProfile(); });

document.getElementById('btn-new-game').onclick = () => { socket.emit('leaveMatch'); clientState = null; serverState = null; myRole = null; confetti = []; activeEmojis = []; activeQuickChats = []; document.getElementById('end-screen').style.display = 'none'; document.getElementById('btn-in-game-quit').style.display = 'none'; document.getElementById('goal-msg').textContent = "Ищем друга..."; document.getElementById('btn-cancel-search').style.display = 'block'; socket.emit('play'); };
document.getElementById('btn-leave-match').onclick = () => { socket.emit('leaveMatch'); clientState = null; serverState = null; myRole = null; confetti = []; activeEmojis = []; activeQuickChats = []; document.getElementById('game-wrapper').style.display = 'none'; document.getElementById('end-screen').style.display = 'none'; document.getElementById('btn-in-game-quit').style.display = 'none'; document.getElementById('main-menu').style.display = 'flex'; updateProfile(); };
socket.on('forceReload', () => { window.location.reload(); });

// ==========================================
// 🔥 ЛИДЕРБОРД
// ==========================================
document.getElementById('btn-leaderboard').onclick = () => {
    socket.emit('getLeaderboard', (res) => {
        if (res.success) {
            const list = document.getElementById('leaderboard-list'); list.innerHTML = '';
            res.leaderboard.forEach(user => {
                const li = document.createElement('li'); li.style.margin = "8px 0";
                const clanBadge = user.clan ? `<span style="color:#8338ec; font-size:14px;">[${user.clan}]</span>` : '';
                li.innerHTML = `<b>${user.name}</b> ${clanBadge} — ЭЛО: ${getLvlHtml(user.rating)} ${user.rating}`;
                list.appendChild(li);
            });
            document.getElementById('leaderboard-modal').style.display = 'flex';
        }
    });
};
document.getElementById('btn-close-lb').onclick = () => { document.getElementById('leaderboard-modal').style.display = 'none'; };

// ==========================================
// 🔥 ИГРОВОЙ ДВИЖОК, ЭКРАН VS И БЫСТРЫЙ ЧАТ
// ==========================================
const canvas = document.getElementById('gameCanvas'); const ctx = canvas.getContext('2d');
let serverState = null; let clientState = null; let myRole = null; let hitCooldown = 0; let wallCooldown = 0;

socket.on('role', role => { myRole = role; });

// Эмодзи и Быстрый чат
window.sendEmoji = function(emoji) { socket.emit('sendEmoji', emoji); };
window.toggleQuickChat = function() {
    const menu = document.getElementById('qc-menu');
    if (menu.style.display === 'flex') { menu.style.display = 'none'; return; }
    menu.innerHTML = myQuickChats.map(txt => `<div class="qc-item" onclick="sendQuickChat('${txt}')">${txt}</div>`).join('');
    menu.style.display = 'flex';
};
window.sendQuickChat = function(txt) {
    socket.emit('sendQuickChat', txt);
    document.getElementById('qc-menu').style.display = 'none';
};

socket.on('showEmoji', (data) => {
    playPop(); let startX = 400; let startY = 200;
    if (data.role === 'p1') { startX = 150; } else if (data.role === 'p2') { startX = 650; } else { startX = 400; startY = 50; }
    activeEmojis.push({ text: data.emoji, x: startX + (Math.random() * 40 - 20), y: startY + (Math.random() * 40 - 20), life: 1.0 });
});

socket.on('showQuickChat', (data) => {
    playPop(); let startX = 400; let startY = 200;
    if (data.role === 'p1') { startX = 150; startY = 100; } else if (data.role === 'p2') { startX = 650; startY = 100; } else { startX = 400; startY = 50; }
    activeQuickChats.push({ text: data.text, x: startX, y: startY, life: 1.5 });
});

socket.on('showVsScreen', (data) => {
    const p1 = data.p1; const p2 = data.p2;
    const p1av = document.getElementById('vs-p1-av');
    p1av.src = `/${p1.avatar || 'avatar1'}.png`;
    p1av.className = p1.vsEffect !== 'none' ? `vs-${p1.vsEffect}` : '';
    document.getElementById('vs-p1-title').innerText = p1.title ? `[${p1.title}]` : '';
    document.getElementById('vs-p1-name').innerText = p1.name;
    document.getElementById('vs-p1-elo').innerHTML = `ЭЛО: ${getLvlHtml(Math.round(p1.rating))} ${Math.round(p1.rating)}`;

    const p2av = document.getElementById('vs-p2-av');
    p2av.src = `/${p2.avatar || 'avatar1'}.png`;
    p2av.className = p2.vsEffect !== 'none' ? `vs-${p2.vsEffect}` : '';
    document.getElementById('vs-p2-title').innerText = p2.title ? `[${p2.title}]` : '';
    document.getElementById('vs-p2-name').innerText = p2.name;
    document.getElementById('vs-p2-elo').innerHTML = `ЭЛО: ${getLvlHtml(Math.round(p2.rating))} ${Math.round(p2.rating)}`;

    const vsScreen = document.getElementById('vs-screen');
    vsScreen.style.display = 'flex';
    
    setTimeout(() => { document.getElementById('vs-p1').style.transform = 'translateX(0)'; document.getElementById('vs-p2').style.transform = 'translateX(0)'; document.getElementById('vs-logo').style.opacity = '1'; }, 100);
    setTimeout(() => { document.getElementById('vs-p1').style.transform = 'translateX(-100vw)'; document.getElementById('vs-p2').style.transform = 'translateX(100vw)'; document.getElementById('vs-logo').style.opacity = '0'; setTimeout(() => { vsScreen.style.display = 'none'; p1av.className = ''; p2av.className = ''; }, 500); }, 3000);
});

socket.on('goalNotify', data => {
    document.getElementById('goal-msg').textContent = data.msg; document.getElementById('goal-msg').style.color = data.color;
    if (data.msg) {
        const myName = nameInput.value; const msgStr = data.msg;
        if (msgStr.includes(myName) || msgStr.includes('ПОБЕДА НАД БОТОМ') || msgStr.includes('ДРУГ СБЕЖАЛ')) { playGoalWin(); } 
        else if (msgStr.includes('ГОЛ:') || msgStr.includes('ЧЕМПИОН:') || msgStr.includes('БОТ ПОБЕДИЛ') || msgStr.includes('ТЕХ. ПОБЕДА:')) { playGoalLose(); }
        canvas.classList.add('shake'); setTimeout(() => canvas.classList.remove('shake'), 400);
        spawnConfetti(data.effectType || 'default');
    }
});

socket.on('gameStateUpdate', s => {
    serverState = s; if (!clientState) clientState = JSON.parse(JSON.stringify(s));
    const renderPaws = (score, color) => {
        const pawSVG = `<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M8.35,3C9.53,2.83 10.78,4.12 11.14,5.9C11.5,7.67 10.85,9.25 9.67,9.43C8.5,9.61 7.24,8.32 6.87,6.54C6.5,4.77 7.17,3.19 8.35,3 M15.5,3C16.69,3.19 17.35,4.77 17,6.54C16.62,8.32 15.37,9.61 14.19,9.43C13,9.25 12.35,7.67 12.71,5.9C13.08,4.12 14.33,2.83 15.5,3 M5.1,7.61C6.22,7.31 7.6,8.39 8.16,10.03C8.73,11.67 8.27,13.25 7.15,13.56C6.03,13.86 4.65,12.78 4.09,11.14C3.52,9.5 3.97,7.92 5.1,7.61 M18.77,7.61C19.9,7.92 20.35,9.5 19.78,11.14C19.22,12.78 17.84,13.86 16.71,13.56C15.59,13.25 15.14,11.67 15.71,10.03C16.27,8.39 17.65,7.31 18.77,7.61 M11.93,11.5C13.72,11.5 15.7,12.22 16.71,13.38C17.75,14.57 18.06,16.5 17.5,17.96C16.92,19.5 15.36,21 12,21C8.64,21 7.08,19.5 6.5,17.96C5.94,16.5 6.25,14.57 7.29,13.38C8.3,12.22 10.14,11.5 11.93,11.5Z" /></svg>`;
        let html = '';
        for (let i = 0; i < 5; i++) { if (i < score) html += `<div style="color: ${color}; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3)); transform: scale(1.1); transition: 0.2s;">${pawSVG}</div>`; else html += `<div style="color: #999; opacity: 0.3; transition: 0.2s;">${pawSVG}</div>`; }
        return html;
    };
    document.getElementById('s1').innerHTML = renderPaws(s.player1.score, '#4da6ff'); document.getElementById('s2').innerHTML = renderPaws(s.player2.score, '#ff4d4d');
    document.getElementById('r1').innerHTML = `(ЭЛО: ${getLvlHtml(Math.round(s.player1.rating))} ${Math.round(s.player1.rating)})`; document.getElementById('r2').innerHTML = `(ЭЛО: ${getLvlHtml(Math.round(s.player2.rating))} ${Math.round(s.player2.rating)})`;
    document.getElementById('n1').textContent = s.player1.name; document.getElementById('n2').textContent = s.player2.name;
    
    if (s.timeLeft !== null && s.timeLeft !== undefined && !s.gameOver) {
        document.getElementById('goal-msg').textContent = `Ждем друга: ${s.timeLeft}с`; document.getElementById('goal-msg').style.color = "#ffb703";
    } else if (s.player1.id && s.player2.id && !s.gameOver && myRole !== 'spectator') {
        document.getElementById('btn-cancel-search').style.display = 'none'; document.getElementById('btn-in-game-quit').style.display = 'block';
        if (document.getElementById('goal-msg').textContent.includes("Ищем") || document.getElementById('goal-msg').textContent.includes("Ждем")) { document.getElementById('goal-msg').textContent = ""; }
    }
    if (s.paused) { clientState.player1.x = s.player1.x; clientState.player1.y = s.player1.y; clientState.player2.x = s.player2.x; clientState.player2.y = s.player2.y; }
});

// ==========================================
// 🔥 УПРАВЛЕНИЕ (МЫШЬ И ТАЧ)
// ==========================================
function sendInput(clientX, clientY) {
    if (!myRole || myRole === 'spectator' || !clientState || !serverState || serverState.paused || serverState.gameOver) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    const me = myRole === 'p1' ? 'player1' : 'player2';
    
    // Определяем радиус клюшки для границ
    let pR = serverState[me].skin === 'kompot' ? 43 : (serverState[me].skin === 'gonya' ? 28 : 35);
    if (serverState[me].skin === 'sazhik') pR = 35;
    
    // Ограничиваем движение своей половиной поля
    let minX = myRole === 'p1' ? pR : 400 + pR;
    let maxX = myRole === 'p1' ? 400 - pR : 800 - pR;
    
    // Локальное предсказание (для мгновенного отклика)
    clientState[me].x = Math.min(maxX, Math.max(minX, x));
    clientState[me].y = Math.min(400 - pR, Math.max(pR, y));
    
    socket.emit('input', { x, y });
}

canvas.addEventListener('mousemove', e => sendInput(e.clientX, e.clientY));
canvas.addEventListener('touchmove', e => { 
    e.preventDefault(); 
    sendInput(e.touches[0].clientX, e.touches[0].clientY); 
}, { passive: false });
canvas.addEventListener('touchstart', e => { 
    e.preventDefault(); 
    sendInput(e.touches[0].clientX, e.touches[0].clientY); 
}, { passive: false });

// ==========================================
// 🔥 ОТРИСОВКА ИГРОКОВ И ПОЛЯ
// ==========================================
function drawPlayer(x, y, skinName, color) {
    let r = skinName === 'kompot' ? 43 : (skinName === 'gonya' ? 28 : 35);
    if (skinName === 'sazhik') r = 35;
    
    if (skinName && skinName !== 'default' && catImages[skinName] && catImages[skinName].complete && catImages[skinName].naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(catImages[skinName], x - r, y - r, r * 2, r * 2);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.lineWidth = 5;
        ctx.strokeStyle = color;
        ctx.stroke();
    } else {
        // Если картинка не прогрузилась — рисуем красивый круг с текстом
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = skinName === 'korzhik' ? 'КОРЖ' : (skinName === 'karamelka' ? 'КАРА' : (skinName === 'kompot' ? 'КОМП' : (skinName === 'gonya' ? 'ГОНЯ' : 'КОТ')));
        ctx.fillText(label, x, y);
    }
}

function render(s) {
    // 1. Фон и разметка
    ctx.fillStyle = '#f4faff';
    ctx.fillRect(0, 0, 800, 400);
    
    // Декоративные элементы
    ctx.font = '30px Arial';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.textAlign = 'center';
    [{t:'🐾', x:120, y:80}, {t:'⭐', x:150, y:320}, {t:'🐾', x:280, y:200}, {t:'⭐', x:350, y:80}, {t:'🐾', x:400, y:320}, {t:'⭐', x:520, y:200}, {t:'🐾', x:680, y:80}, {t:'⭐', x:650, y:320}].forEach(d => ctx.fillText(d.t, d.x, d.y));
    
    // Поле
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ff4d4d';
    ctx.beginPath(); ctx.moveTo(400,0); ctx.lineTo(400,400); ctx.stroke(); // Центр
    ctx.strokeStyle = '#4da6ff';
    ctx.beginPath(); ctx.arc(400,200,80,0,Math.PI*2); ctx.stroke(); // Круг
    
    // Ворота
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#4da6ff'; ctx.strokeRect(0, 115, 10, 170);
    ctx.strokeStyle = '#ff4d4d'; ctx.strokeRect(790, 115, 10, 170);

    // 2. След шайбы
    if (!serverState.paused && !serverState.gameOver) {
        puckTrail.push({x: s.puck.x, y: s.puck.y});
        if(puckTrail.length > 10) puckTrail.shift();
    } else { puckTrail = []; }

    for (let i = 0; i < puckTrail.length; i++) {
        ctx.beginPath();
        ctx.arc(puckTrail[i].x, puckTrail[i].y, 22 * (i/puckTrail.length), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(130, 200, 255, ${0.4 * (i/puckTrail.length)})`;
        ctx.fill();
    }
    
    // 3. Шайба
    ctx.beginPath();
    ctx.arc(s.puck.x, s.puck.y, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#333';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#111';
    ctx.stroke();

    // 4. Игроки
    drawPlayer(s.player1.x, s.player1.y, serverState.player1.skin, '#4da6ff');
    drawPlayer(s.player2.x, s.player2.y, serverState.player2.skin, '#ff4d4d');

    // 5. Эффекты (Конфетти)
    if (confetti.length > 0) {
        confetti.forEach((c, index) => {
            if (c.type === 'blackhole') {
                c.vx -= (c.x - 400) * 0.05; c.vy -= (c.y - 200) * 0.05;
                c.x += c.vx * 0.1; c.y += c.vy * 0.1;
            } else if (c.type === 'fire') {
                c.x += c.vx; c.y += c.vy; c.vy -= 0.5;
            } else {
                c.x += c.vx; c.y += c.vy; c.vy += 0.8;
            }
            c.life -= 0.02;
            ctx.globalAlpha = Math.max(0, c.life);
            ctx.fillStyle = c.color;
            ctx.fillRect(c.x, c.y, c.size, c.size);
            if (c.life <= 0) confetti.splice(index, 1);
        });
        ctx.globalAlpha = 1.0;
    }
    
    // 6. Эмодзи
    activeEmojis.forEach((em, index) => {
        em.y -= 1.5; em.life -= 0.015;
        ctx.save();
        ctx.globalAlpha = Math.max(0, em.life);
        ctx.font = '50px Arial';
        ctx.fillText(em.text, em.x, em.y);
        ctx.restore();
        if (em.life <= 0) activeEmojis.splice(index, 1);
    });

    // 7. 🔥 ОБЛАЧКА БЫСТРОГО ЧАТА (Quick Chat)
    activeQuickChats.forEach((qc, index) => {
        qc.y -= 0.5; qc.life -= 0.01;
        ctx.save();
        ctx.globalAlpha = Math.max(0, qc.life);
        ctx.font = 'bold 16px Comic Sans MS';
        const textWidth = ctx.measureText(qc.text).width;
        
        // Фон облачка
        ctx.fillStyle = 'white';
        ctx.strokeStyle = '#4da6ff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(qc.x - textWidth/2 - 10, qc.y - 45, textWidth + 20, 30, 10);
        ctx.fill();
        ctx.stroke();
        
        // Хвостик
        ctx.beginPath();
        ctx.moveTo(qc.x - 5, qc.y - 15);
        ctx.lineTo(qc.x + 5, qc.y - 15);
        ctx.lineTo(qc.x, qc.y - 5);
        ctx.fill();
        
        // Текст
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.fillText(qc.text, qc.x, qc.y - 25);
        ctx.restore();
        
        if (qc.life <= 0) activeQuickChats.splice(index, 1);
    });
}

// ==========================================
// 🔥 ГЛАВНЫЙ ЦИКЛ (СГЛАЖИВАНИЕ)
// ==========================================
function loop() {
    if (serverState && clientState) {
        const lerp = 0.4;
        
        // Шайбу сглаживаем всегда
        clientState.puck.x += (serverState.puck.x - clientState.puck.x) * lerp;
        clientState.puck.y += (serverState.puck.y - clientState.puck.y) * lerp;
        
        // Свою клюшку НЕ сглаживаем (чтобы была мгновенная реакция),
        // кроме моментов паузы или если мы зритель.
        if (myRole !== 'p1' || serverState.paused || myRole === 'spectator') {
            clientState.player1.x += (serverState.player1.x - clientState.player1.x) * lerp;
            clientState.player1.y += (serverState.player1.y - clientState.player1.y) * lerp;
        }
        if (myRole !== 'p2' || serverState.paused || myRole === 'spectator') {
            clientState.player2.x += (serverState.player2.x - clientState.player2.x) * lerp;
            clientState.player2.y += (serverState.player2.y - clientState.player2.y) * lerp;
        }
        
        // Звуки столкновений (только в активной игре)
        if (!serverState.paused && !serverState.gameOver) {
            if (hitCooldown > 0) hitCooldown--;
            if (wallCooldown > 0) wallCooldown--;
            
            if ((serverState.puck.y <= 26 || serverState.puck.y >= 374) && wallCooldown === 0) {
                playWall(); wallCooldown = 15;
            }
            
            const checkHit = (p) => {
                let r = serverState[p].skin === 'kompot' ? 43 : (serverState[p].skin === 'gonya' ? 28 : 35);
                if (serverState[p].skin === 'sazhik') r = 35;
                let dx = clientState.puck.x - clientState[p].x;
                let dy = clientState.puck.y - clientState[p].y;
                if (Math.sqrt(dx*dx + dy*dy) < r + 22 + 5 && hitCooldown === 0) {
                    playHit(); hitCooldown = 15;
                }
            };
            checkHit('player1'); checkHit('player2');
        }
        
        render(clientState);
    }
    requestAnimationFrame(loop);
}

// Запуск движка
loop();