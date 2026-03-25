const socket = io();

// ==========================================
// 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И МАГАЗИН
// ==========================================
let userInventory = ['default'];
let userCurrentSkin = 'default';
let shopIndex = 0;
let myQuickChats = []; // Загружается из профиля

const shopItems = [
    { id: 'default', name: 'Обычный', boost: 'Нет бонусов', price: 0, color: '#4da6ff' },
    { id: 'korzhik', name: 'Коржик', boost: 'Сильный удар', price: 250, color: '#fb8500' },
    { id: 'karamelka', name: 'Карамелька', boost: 'Супер-скорость', price: 250, color: '#e63946' },
    { id: 'kompot', name: 'Компот', boost: 'Большая клюшка', price: 500, color: '#06d6a0' },
    { id: 'gonya', name: 'Гоня 👽', boost: 'Меткий и бешеный!', price: 500, color: '#8338ec' },
    { id: 'sazhik', name: 'Сажик 🐈‍⬛', boost: 'Эндгейм Мастер!', price: 999999, color: '#2b2d42' }
];

// ==========================================
// 2. ЗАГРУЗКА РЕСУРСОВ (Котятки и Звуки)
// ==========================================
const catImages = {
    'korzhik': new Image(), 'karamelka': new Image(), 'kompot': new Image(), 'gonya': new Image(), 'sazhik': new Image()
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
window.addEventListener('click', () => { if (audioCtx.state === 'suspended') audioCtx.resume(); });

function playPop() {
    if (audioCtx.state === 'suspended') return;
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
}

function playSound(audioObj) {
    if (!audioObj.src || audioObj.src.includes('undefined')) return;
    const clone = audioObj.cloneNode(); clone.volume = 0.4;
    clone.play().catch(() => {});
}

// ==========================================
// 3. ВИЗУАЛЬНЫЕ ЭФФЕКТЫ (Конфетти и Уровни)
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
            vx = (Math.random() - 0.5) * 20; vy = (Math.random() * -20) - 5; size = Math.random() * 12 + 5;
        } else if (type === 'blackhole') {
            color = `hsl(${Math.random() * 60 + 260}, 100%, 60%)`;
            const angle = Math.random() * Math.PI * 2; const dist = Math.random() * 300 + 100;
            vx = 0; vy = 0; size = Math.random() * 6 + 3;
            confetti.push({ x: 400 + Math.cos(angle) * dist, y: 200 + Math.sin(angle) * dist, vx, vy, color, size, life: 1.5, type });
            continue;
        } else if (type === 'ice') {
            color = `hsl(${Math.random() * 40 + 180}, 100%, 80%)`;
            vx = (Math.random() - 0.5) * 40; vy = (Math.random() - 0.5) * 40; size = Math.random() * 8 + 4;
        } else {
            color = `hsl(${Math.random() * 360}, 100%, 50%)`;
            vx = (Math.random() - 0.5) * 25; vy = (Math.random() - 0.5) * 25; size = Math.random() * 8 + 4;
        }
        confetti.push({ x: 400, y: 200, vx, vy, color, size, life: 1, type });
    }
}
// ==========================================
// 4. ОБНОВЛЕНИЕ ПРОФИЛЯ И ДАННЫХ
// ==========================================
function updateProfile() {
    socket.emit('getProfile', (data) => {
        if (!data.success) return;
        
        // Монеты и инвентарь
        document.getElementById('menu-coins').innerText = `💰 ${data.coins}`;
        document.getElementById('shop-coins').innerText = `💰 ${data.coins}`;
        userInventory = data.inventory;
        userCurrentSkin = data.skin;

        // Личный профиль
        document.getElementById('profile-name').innerText = nameInput.value.toUpperCase();
        document.getElementById('profile-mmr').innerText = `🏆 ЭЛО: ${data.rating}`;
        document.getElementById('profile-avatar').src = `/${data.avatar || 'avatar1'}.png`;
        
        // Титул (если есть)
        const titleBox = document.getElementById('profile-title-display');
        if (data.title) {
            titleBox.innerText = data.title;
            titleBox.style.display = 'block';
        } else { titleBox.style.display = 'none'; }

        // Кнопка админа
        if (data.isAdmin) {
            document.getElementById('btn-admin').style.display = 'inline-block';
        }

        // Боевой Пропуск (XP и Уровни)
        document.getElementById('bp-current-lvl').innerText = data.bpLevel;
        document.getElementById('bp-progress-bar').style.width = `${data.bpXP}%`;
        document.getElementById('bp-progress-text').innerText = `${data.bpXP} / 100 XP`;
        
        // Темный рынок (доступ на 30 уровне)
        if (data.bpLevel >= 30) {
            document.getElementById('bp-secret-shop').style.display = 'block';
            document.getElementById('bp-secret-xp').innerText = data.bpXP;
        }

        // Бейдж уведомлений друзей
        const badge = document.getElementById('req-badge');
        if (data.reqCount > 0) {
            badge.style.display = 'block';
            badge.innerText = data.reqCount;
            document.getElementById('req-count').innerText = `(${data.reqCount})`;
        } else {
            badge.style.display = 'none';
            document.getElementById('req-count').innerText = '';
        }

        // Обновление селекторов эффектов
        updateEffectSelectors(data);
    });
}

function updateEffectSelectors(data) {
    const goalSel = document.getElementById('effect-selector');
    const vsSel = document.getElementById('vs-effect-selector');

    // Разблокировка эффектов гола
    if (data.goalEffects.includes('fire')) document.getElementById('opt-fire').disabled = false;
    if (data.goalEffects.includes('blackhole')) document.getElementById('opt-blackhole').disabled = false;
    if (data.goalEffects.includes('ice')) document.getElementById('opt-ice').disabled = false;
    goalSel.value = data.currentGoalEffect;

    // Разблокировка VS-эффектов
    if (data.vsEffects.includes('fire')) document.getElementById('vs-opt-fire').disabled = false;
    if (data.vsEffects.includes('ice')) document.getElementById('vs-opt-ice').disabled = false;
    if (data.vsEffects.includes('neon')) document.getElementById('vs-opt-neon').disabled = false;
    if (data.vsEffects.includes('gold')) document.getElementById('vs-opt-gold').disabled = false;
    if (data.vsEffects.includes('matrix')) document.getElementById('vs-opt-matrix').disabled = false;
    vsSel.value = data.currentVsEffect;
}

// ==========================================
// 5. МАГАЗИН СКИНОВ (ЛОГИКА)
// ==========================================
function updateShopPreview() {
    const item = shopItems[shopIndex];
    const previewImg = document.getElementById('shop-item-preview');
    const previewBorder = document.getElementById('shop-item-preview-border');
    const actionBtn = document.getElementById('btn-shop-action');
    
    document.getElementById('shop-item-name').innerText = item.name;
    document.getElementById('shop-item-boost').innerText = `⚡ ${item.boost}`;
    previewImg.src = `/${item.id}.png`;
    previewBorder.style.borderColor = item.color;
    
    if (userInventory.includes(item.id)) {
        document.getElementById('shop-item-price').innerText = "В ИНВЕНТАРЕ";
        actionBtn.innerText = (userCurrentSkin === item.id) ? "ВЫБРАНО" : "НАДЕТЬ";
        actionBtn.className = "btn btn-blue";
    } else {
        document.getElementById('shop-item-price').innerText = `Цена: ${item.price} 💰`;
        actionBtn.innerText = "КУПИТЬ";
        actionBtn.className = "btn btn-orange";
    }
}

document.getElementById('btn-shop-next').onclick = () => { shopIndex = (shopIndex + 1) % shopItems.length; updateShopPreview(); };
document.getElementById('btn-shop-prev').onclick = () => { shopIndex = (shopIndex - 1 + shopItems.length) % shopItems.length; updateShopPreview(); };

document.getElementById('btn-shop-action').onclick = () => {
    const item = shopItems[shopIndex];
    socket.emit('buySkin', item.id, (res) => {
        if (res.success) {
            playPop();
            updateProfile();
            setTimeout(updateShopPreview, 100);
        } else {
            document.getElementById('shop-error').innerText = res.msg;
            setTimeout(() => document.getElementById('shop-error').innerText = '', 2000);
        }
    });
};

// ==========================================
// 6. КЛАНЫ, ДРУЗЬЯ И БП
// ==========================================
window.createClan = () => {
    const name = document.getElementById('new-clan-name').value;
    socket.emit('createClan', { name }, (res) => {
        alert(res.msg);
        if (res.success) updateProfile();
    });
};

window.buyBpItem = (item) => {
    socket.emit('buyBpItem', item, (res) => {
        alert(res.msg);
        if (res.success) updateProfile();
    });
};

window.switchTab = (tabId) => {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    document.getElementById(tabId).style.display = 'block';
    if (tabId === 'tab-list') loadFriendsList();
    if (tabId === 'tab-reqs') loadRequestsList();
};

function loadFriendsList() {
    socket.emit('getFriends', (res) => {
        const list = document.getElementById('friends-list');
        if (!res.friends.length) return list.innerHTML = "<p>У тебя пока нет друзей :(</p>";
        list.innerHTML = res.friends.map(f => `
            <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee;">
                <span>${f.name} (🏆${f.rating})</span>
                <button onclick="sendGift('${f.name}')" class="btn btn-small btn-orange">🎁 50💰</button>
            </div>
        `).join('');
    });
}

// Уведомление о повышении уровня БП
socket.on('bpLevelUp', (data) => {
    spawnConfetti('default');
    alert(`🎉 УРОВЕНЬ БП ПОВЫШЕН: ${data.level}!\nНаграды: ${data.rewards.join(', ')}`);
    updateProfile();
});

// ==========================================
// 7. ЛОГИКА ТУРНИРОВ И АДМИН-ПАНЕЛИ
// ==========================================
socket.on('tourneyAnnounce', (data) => {
    // Всплывающее уведомление о статусе турнира
    const tBtn = document.getElementById('btn-tourney');
    if (data.type === 'reg') {
        tBtn.style.display = 'inline-block';
        alert(`📢 ${data.msg}\nНажми на красную кнопку в меню, чтобы записаться!`);
    } else if (data.type === 'cancel' || data.type === 'end') {
        tBtn.style.display = 'none';
        alert(`🏆 ${data.msg}`);
    } else {
        alert(`⚔️ ${data.msg}`);
    }
});

socket.on('tourneyMsg', (msg) => {
    // Личные сообщения турнира (проход в некст раунд и т.д.)
    alert("🏆 ТУРНИР: " + msg);
});

window.adminTourney = (action) => {
    socket.emit('tourneyAdminAction', action, (res) => {
        if (res.success) {
            loadAdminUsers(); // Обновляем инфу в админке
        } else {
            alert(res.msg);
        }
    });
};

function loadAdminUsers() {
    socket.emit('adminGetUsers', (res) => {
        if (!res.success) return;
        // Обновляем статус турнира в админке
        document.getElementById('admin-tourney-state').innerText = res.tourneyState.toUpperCase();
        document.getElementById('admin-tourney-players').innerText = res.tourneyPlayers;

        const list = document.getElementById('admin-users-list');
        list.innerHTML = res.users.map(u => `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px;"><b>${u.name}</b><br><small style="color: #999;">${u.regIp}</small></td>
                <td>${u.rating}</td>
                <td>${u.coins}</td>
                <td>
                    <button class="btn btn-red btn-small" onclick="adminAction('${u.name}', 'ban')">БАН</button>
                    <button class="btn btn-green btn-small" onclick="adminAction('${u.name}', 'addCoins', 100)">+100💰</button>
                </td>
            </tr>
        `).join('');
    });
}

window.adminAction = (name, action, amount = 0) => {
    socket.emit('adminAction', { targetName: name, action, amount }, (res) => {
        if (res.success) loadAdminUsers();
        else alert("Ошибка админки");
    });
};

// ==========================================
// 8. ЭКРАН ПРЕДПРОСМОТРА (VS SCREEN)
// ==========================================
socket.on('showVsScreen', (data) => {
    const vs = document.getElementById('vs-screen');
    const p1 = document.getElementById('vs-p1');
    const p2 = document.getElementById('vs-p2');
    const logo = document.getElementById('vs-logo');

    // Наполняем данными
    document.getElementById('vs-p1-name').innerText = data.p1.name;
    document.getElementById('vs-p2-name').innerText = data.p2.name;
    document.getElementById('vs-p1-elo').innerText = `🏆 ${data.p1.rating}`;
    document.getElementById('vs-p2-elo').innerText = `🏆 ${data.p2.rating}`;
    document.getElementById('vs-p1-av').src = `/${data.p1.avatar || 'avatar1'}.png`;
    document.getElementById('vs-p2-av').src = `/${data.p2.avatar || 'avatar2'}.png`;

    // Применяем VS-эффекты (рамки)
    document.getElementById('vs-p1-av').className = data.p1.vsEffect !== 'none' ? `vs-${data.p1.vsEffect}` : '';
    document.getElementById('vs-p2-av').className = data.p2.vsEffect !== 'none' ? `vs-${data.p2.vsEffect}` : '';

    vs.style.display = 'flex';
    
    // Анимация выезда
    setTimeout(() => {
        p1.style.transform = 'translateX(0)';
        p2.style.transform = 'translateX(0)';
        logo.style.opacity = '1';
        logo.style.transform = 'scale(1.2)';
    }, 100);

    // Скрываем через 3.5 секунды
    setTimeout(() => {
        vs.style.display = 'none';
        p1.style.transform = 'translateX(-100vw)';
        p2.style.transform = 'translateX(100vw)';
        logo.style.opacity = '0';
    }, 3500);
});

// ==========================================
// 9. СИСТЕМА ОТРИСОВКИ (RENDER ENGINE)
// ==========================================
function drawField() {
    // Фон
    ctx.fillStyle = '#f4faff';
    ctx.fillRect(0, 0, 800, 400);

    // Разметка (Центральная линия)
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255, 77, 77, 0.5)';
    ctx.beginPath(); ctx.moveTo(400, 0); ctx.lineTo(400, 400); ctx.stroke();

    // Центральный круг
    ctx.strokeStyle = 'rgba(77, 166, 255, 0.5)';
    ctx.beginPath(); ctx.arc(400, 200, 80, 0, Math.PI * 2); ctx.stroke();
    
    // Маленький круг в центре
    ctx.fillStyle = 'rgba(77, 166, 255, 0.2)';
    ctx.beginPath(); ctx.arc(400, 200, 10, 0, Math.PI * 2); ctx.fill();

    // Ворота
    ctx.lineWidth = 15;
    ctx.strokeStyle = '#4da6ff'; // Игрок 1
    ctx.strokeRect(-10, 125, 20, 150);
    
    ctx.strokeStyle = '#ff4d4d'; // Игрок 2
    ctx.strokeRect(790, 125, 20, 150);

    // Декор (лапки на поле)
    ctx.font = '30px Arial';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillText('🐾', 100, 100); ctx.fillText('🐾', 700, 300);
    ctx.fillText('🐾', 100, 300); ctx.fillText('🐾', 700, 100);
}

function drawPlayer(p, color) {
    let r = 35; // Дефолтный радиус
    if (p.skin === 'kompot') r = 43;
    if (p.skin === 'gonya') r = 28;
    
    ctx.save();
    
    // Тень под игроком
    ctx.shadowBlur = 15;
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    
    // Рисуем скин кота
    if (p.skin && p.skin !== 'default' && catImages[p.skin] && catImages[p.skin].complete) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(catImages[p.skin], p.x - r, p.y - r, r * 2, r * 2);
    } else {
        // Заглушка, если скин не прогрузился
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }
    
    ctx.restore();

    // Обводка клюшки
    ctx.lineWidth = 5;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();

    // Никнейм над головой (только в матче)
    ctx.fillStyle = '#333';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(p.name, p.x, p.y - r - 10);
}

function drawPuck(puck) {
    // След от шайбы (Trail)
    if (puckTrail.length > 0) {
        puckTrail.forEach((pos, i) => {
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 22 * (i / puckTrail.length), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(130, 200, 255, ${0.4 * (i / puckTrail.length)})`;
            ctx.fill();
        });
    }

    // Тело шайбы
    ctx.beginPath();
    ctx.arc(puck.x, puck.y, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#333';
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.fill();
    
    // Блик на шайбе
    ctx.beginPath();
    ctx.arc(puck.x - 6, puck.y - 6, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fill();
    ctx.shadowBlur = 0;
}

// ==========================================
// 10. УПРАВЛЕНИЕ (МЫШЬ И ТАЧ)
// ==========================================
function sendInput(clientX, clientY) {
    if (!myRole || myRole === 'spectator' || !serverState || serverState.paused || serverState.gameOver) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    
    // Локальное предсказание (чтобы своя клюшка не лагала)
    const me = myRole === 'p1' ? 'player1' : 'player2';
    if (clientState) {
        let r = serverState[me].skin === 'kompot' ? 43 : (serverState[me].skin === 'gonya' ? 28 : 35);
        let minX = myRole === 'p1' ? r : 400 + r;
        let maxX = myRole === 'p1' ? 400 - r : 800 - r;
        clientState[me].x = Math.min(maxX, Math.max(minX, x));
        clientState[me].y = Math.min(400 - r, Math.max(r, y));
    }

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
// 11. ЛОГИКА БЫСТРЫХ ФРАЗ (QUICK CHAT)
// ==========================================
window.toggleQuickChat = () => {
    const menu = document.getElementById('qc-menu');
    const phrases = ["Хороший сейв! 🛡️", "Ну ты даешь! 🚀", "Почти попал... 😿", "GG WP! 🤝", "Удачи! 🐾"];
    
    if (menu.style.display === 'flex') {
        menu.style.display = 'none';
    } else {
        menu.innerHTML = phrases.map(p => `<div class="qc-item" onclick="sendQuickChat('${p}')">${p}</div>`).join('');
        menu.style.display = 'flex';
    }
};

window.sendQuickChat = (text) => {
    socket.emit('sendQuickChat', text);
    document.getElementById('qc-menu').style.display = 'none';
};

// Получаем фразу от другого игрока
socket.on('showQuickChat', (data) => {
    playPop();
    // Определяем координаты над головой игрока
    const target = data.role === 'p1' ? serverState.player1 : serverState.player2;
    activeQuickChats.push({
        text: data.text,
        x: target.x,
        y: target.y - 50,
        life: 1.0, // Время жизни в секундах
        role: data.role
    });
});

function drawQuickChats() {
    activeQuickChats.forEach((qc, i) => {
        qc.life -= 0.01;
        qc.y -= 0.5; // Плывет вверх

        ctx.save();
        ctx.globalAlpha = Math.max(0, qc.life * 2);
        ctx.font = 'bold 16px Arial';
        const tw = ctx.measureText(qc.text).width;
        
        // Рисуем облачко
        ctx.fillStyle = 'white';
        ctx.strokeStyle = qc.role === 'p1' ? '#4da6ff' : '#ff4d4d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(qc.x - tw/2 - 10, qc.y - 25, tw + 20, 30, 10);
        ctx.fill(); ctx.stroke();
        
        // Текст
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.fillText(qc.text, qc.x, qc.y - 5);
        ctx.restore();

        if (qc.life <= 0) activeQuickChats.splice(i, 1);
    });
}

// ==========================================
// 12. ГЛАВНЫЙ ЦИКЛ (LOOP)
// ==========================================
function loop() {
    if (serverState && clientState) {
        const lerpFactor = 0.35; // Коэффициент плавности

        // Плавное движение шайбы
        clientState.puck.x += (serverState.puck.x - clientState.puck.x) * lerpFactor;
        clientState.puck.y += (serverState.puck.y - clientState.puck.y) * lerpFactor;

        // Плавное движение оппонента (свою клюшку мы уже предсказали в input)
        if (myRole === 'p1' || myRole === 'spectator') {
            clientState.player2.x += (serverState.player2.x - clientState.player2.x) * lerpFactor;
            clientState.player2.y += (serverState.player2.y - clientState.player2.y) * lerpFactor;
        }
        if (myRole === 'p2' || myRole === 'spectator') {
            clientState.player1.x += (serverState.player1.x - clientState.player1.x) * lerpFactor;
            clientState.player1.y += (serverState.player1.y - clientState.player1.y) * lerpFactor;
        }

        // Обновляем след (trail)
        puckTrail.push({ x: clientState.puck.x, y: clientState.puck.y });
        if (puckTrail.length > 12) puckTrail.shift();

        // РЕНДЕРИНГ
        ctx.clearRect(0, 0, 800, 400);
        drawField();
        
        // Рисуем эффекты гола (конфетти)
        confetti.forEach((c, i) => {
            c.x += c.vx; c.y += c.vy; c.vy += 0.5; c.life -= 0.01;
            ctx.fillStyle = c.color;
            ctx.globalAlpha = Math.max(0, c.life);
            ctx.fillRect(c.x, c.y, c.size, c.size);
            if (c.life <= 0) confetti.splice(i, 1);
        });
        ctx.globalAlpha = 1;

        drawPuck(clientState.puck);
        drawPlayer(clientState.player1, '#4da6ff');
        drawPlayer(clientState.player2, '#ff4d4d');
        
        drawQuickChats();
        
        // Звуки (на основе изменений сервера)
        // Здесь можно добавить проверку столкновений для звука hit.mp3
    }
    requestAnimationFrame(loop);
}

// Запуск игрового движка
loop();

// Обработка голов и уведомлений
socket.on('goalNotify', (data) => {
    const msgEl = document.getElementById('goal-msg');
    msgEl.innerText = data.msg;
    msgEl.style.color = data.color;
    
    if (data.msg !== "") {
        spawnConfetti(data.effectType || 'default');
        if (data.msg.includes('ГОЛ')) {
            playSound(sndHit); // Или специальный звук гола
        }
    }
    
    // Обновляем счет на табло
    if (serverState) {
        const s1 = document.getElementById('s1');
        const s2 = document.getElementById('s2');
        s1.innerHTML = '🔵'.repeat(serverState.player1.score);
        s2.innerHTML = '🔴'.repeat(serverState.player2.score);
    }
});

socket.on('showEndScreen', () => {
    document.getElementById('end-screen').style.display = 'flex';
});

document.getElementById('btn-leave-match').onclick = () => {
    location.reload(); // Простой способ вернуться в меню
};

// ==========================================
// 13. УПРАВЛЕНИЕ ОКНАМИ (MODALS)
// ==========================================
function closeAllModals() {
    document.querySelectorAll('.overlay').forEach(el => {
        // Не закрываем экраны VS и конца матча во время игры
        if (el.id !== 'vs-screen' && el.id !== 'end-screen' && el.id !== 'auth-screen') {
            el.style.display = 'none';
        }
    });
}

// Открытие окон по кнопкам в меню
document.getElementById('btn-my-profile').onclick = () => {
    updateProfile();
    document.getElementById('profile-modal').style.display = 'flex';
    document.getElementById('profile-edit-section').style.display = 'block';
    document.getElementById('btn-logout').style.display = 'block';
};

document.getElementById('btn-shop').onclick = () => {
    updateShopPreview();
    document.getElementById('shop-modal').style.display = 'flex';
};

document.getElementById('btn-bp').onclick = () => {
    updateProfile();
    document.getElementById('bp-modal').style.display = 'flex';
};

document.getElementById('btn-clans').onclick = () => {
    loadClansList();
    document.getElementById('clans-modal').style.display = 'flex';
};

document.getElementById('btn-friends').onclick = () => {
    switchTab('tab-list');
    document.getElementById('friends-modal').style.display = 'flex';
};

document.getElementById('btn-leaderboard').onclick = () => {
    socket.emit('getLeaderboard', (res) => {
        const list = document.getElementById('leaderboard-list');
        list.innerHTML = res.map((u, i) => `<li>${i+1}. ${u.name} — 🏆${u.rating}</li>`).join('');
        document.getElementById('leaderboard-modal').style.display = 'flex';
    });
};

// Закрытие окон при клике на фон (опционально) или кнопки "Закрыть"
document.getElementById('btn-close-shop').onclick = closeAllModals;
document.getElementById('btn-close-bp').onclick = closeAllModals;
document.getElementById('btn-close-admin').onclick = closeAllModals;
document.getElementById('btn-close-friends').onclick = closeAllModals;
document.getElementById('btn-close-clans').onclick = closeAllModals;

// ==========================================
// 14. ЛОГИКА ИГРОВЫХ КНОПОК
// ==========================================
document.getElementById('btn-play-menu').onclick = () => {
    playPop();
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('game-wrapper').style.display = 'flex';
    document.getElementById('btn-cancel-search').style.display = 'block';
    socket.emit('play'); // Запрос на поиск игры
};

document.getElementById('btn-cancel-search').onclick = () => {
    socket.emit('leaveMatch');
    document.getElementById('game-wrapper').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
};

document.getElementById('btn-in-game-quit').onclick = () => {
    if (confirm("Выйти из матча? Это засчитает поражение!")) {
        socket.emit('leaveMatch');
        location.reload();
    }
};

document.getElementById('btn-new-game').onclick = () => {
    document.getElementById('end-screen').style.display = 'none';
    socket.emit('rematch');
};

// ==========================================
// 15. СОЦИАЛЬНЫЕ ФУНКЦИИ (ПОДАРКИ И ПОИСК)
// ==========================================
window.sendGift = (targetName) => {
    const amount = 50;
    if (confirm(`Отправить 50💰 игроку ${targetName}?`)) {
        socket.emit('sendGift', { targetName, amount }, (res) => {
            alert(res.msg);
            updateProfile();
        });
    }
};

window.searchFriends = () => {
    const query = document.getElementById('search-input').value;
    socket.emit('searchUser', query, (res) => {
        const results = document.getElementById('search-results');
        if (!res.users.length) results.innerHTML = "Никто не найден 😿";
        else {
            results.innerHTML = res.users.map(u => `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span>${u.name} (🏆${u.rating})</span>
                    <button onclick="sendFriendRequest('${u.name}')" class="btn btn-blue btn-small">➕ Добавить</button>
                </div>
            `).join('');
        }
    });
};

window.sendFriendRequest = (name) => {
    socket.emit('sendFriendRequest', name, (res) => alert(res.msg));
};

function loadRequestsList() {
    socket.emit('getRequests', (res) => {
        const list = document.getElementById('requests-list');
        if (!res.requests.length) list.innerHTML = "Запросов пока нет.";
        else {
            list.innerHTML = res.requests.map(name => `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span>${name}</span>
                    <div>
                        <button onclick="handleRequest('${name}', true)" class="btn btn-green btn-small">✅</button>
                        <button onclick="handleRequest('${name}', false)" class="btn btn-red btn-small">❌</button>
                    </div>
                </div>
            `).join('');
        }
    });
}

window.handleRequest = (name, accept) => {
    socket.emit('handleFriendRequest', { name, accept }, (res) => {
        alert(res.msg);
        loadRequestsList();
        updateProfile();
    });
};

// ==========================================
// 16. КАСТОМИЗАЦИЯ (ЭФФЕКТЫ)
// ==========================================
window.setGoalEffect = (val) => {
    socket.emit('setGoalEffect', val, (res) => {
        if (res.success) updateProfile();
    });
};

window.setVsEffect = (val) => {
    socket.emit('setVsEffect', val, (res) => {
        if (res.success) updateProfile();
    });
};

window.setAvatar = (av) => {
    socket.emit('setAvatar', av, (res) => {
        if (res.success) updateProfile();
    });
};

// ==========================================
// 17. ГЛОБАЛЬНЫЙ ЧАТ
// ==========================================
const chatToggle = document.getElementById('chat-header');
const chatBody = document.getElementById('chat-body');
const chatInput = document.getElementById('chat-input');
const chatMsgs = document.getElementById('chat-messages');

chatToggle.onclick = () => {
    const isCollapsed = document.getElementById('global-chat').classList.toggle('collapsed');
    chatBody.style.display = isCollapsed ? 'none' : 'flex';
    document.getElementById('chat-toggle-icon').innerText = isCollapsed ? '▲' : '▼';
};

document.getElementById('btn-send-chat').onclick = sendChatMessage;
chatInput.onkeydown = (e) => { if (e.key === 'Enter') sendChatMessage(); };

function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    socket.emit('sendGlobalChat', text);
    chatInput.value = '';
}

socket.on('newGlobalMsg', (data) => {
    const msgDiv = document.createElement('div');
    msgDiv.innerHTML = `<b>${data.name}:</b> ${data.msg}`;
    chatMsgs.appendChild(msgDiv);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
});

// Слушаем принудительную перезагрузку (для бана или обновлений)
socket.on('forceReload', () => location.reload());

// ==========================================
// 18. ФИНАЛЬНАЯ ИНИЦИАЛИЗАЦИЯ
// ==========================================
console.log("🐾 Три Кота Аэрохоккей запущен!");
updateProfile();