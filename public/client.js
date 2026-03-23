const socket = io();

const catImages = { 'korzhik': new Image(), 'karamelka': new Image(), 'kompot': new Image(), 'gonya': new Image() };
catImages.korzhik.src = '/korzhik.png'; catImages.karamelka.src = '/karamelka.png'; 
catImages.kompot.src = '/kompot.png'; catImages.gonya.src = '/gonya.png';

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
    nameInput.value = savedName; passInput.value = savedPass;
    socket.emit('login', { name: savedName, password: savedPass }, handleAuthResponse);
}

document.getElementById('btn-login').onclick = () => {
    authError.innerText = "Подключение...";
    socket.emit('login', { name: nameInput.value, password: passInput.value }, handleAuthResponse);
};
document.getElementById('btn-register').onclick = () => {
    authError.innerText = "Создание...";
    socket.emit('register', { name: nameInput.value, password: passInput.value }, handleAuthResponse);
};

function handleAuthResponse(res) {
    if (res.success) {
        authScreen.style.display = 'none';
        if (res.rejoining) {
            mainMenu.style.display = 'none'; gameWrapper.style.display = 'flex';
            document.getElementById('btn-cancel-search').style.display = 'none';
        } else { mainMenu.style.display = 'flex'; }
        
        updateProfile(); 
        if (rememberCb.checked) {
            localStorage.setItem('ah_name', nameInput.value); localStorage.setItem('ah_pass', passInput.value);
        } else {
            localStorage.removeItem('ah_name'); localStorage.removeItem('ah_pass');
        }
    } else { authScreen.style.display = 'flex'; authError.innerText = res.msg; }
}

function updateProfile() {
    socket.emit('getProfile', (data) => {
        if (data.success) {
            document.getElementById('menu-coins').innerText = `💰 Монеты: ${data.coins}`;
            document.getElementById('shop-coins').innerText = `Ваши монеты: ${data.coins}`;
            ['default', 'korzhik', 'karamelka', 'kompot', 'gonya'].forEach(skin => {
                const el = document.getElementById('skin-' + skin);
                const priceEl = document.getElementById('price-' + skin);
                el.classList.remove('equipped');
                if (data.inventory.includes(skin)) { priceEl.innerText = "Куплено"; priceEl.style.color = "#06d6a0"; }
                if (data.skin === skin) { el.classList.add('equipped'); priceEl.innerText = "Надето"; priceEl.style.color = "#219ebc"; }
            });
        }
    });
}

window.buySkin = function(skinName) {
    socket.emit('buySkin', skinName, (res) => {
        if (res.success) { document.getElementById('shop-error').innerText = ""; updateProfile(); } 
        else { document.getElementById('shop-error').innerText = res.msg; }
    });
};

document.getElementById('btn-shop').onclick = () => { updateProfile(); document.getElementById('shop-modal').style.display = 'flex'; };
document.getElementById('btn-close-shop').onclick = () => document.getElementById('shop-modal').style.display = 'none';

document.getElementById('btn-play').onclick = () => {
    mainMenu.style.display = 'none'; gameWrapper.style.display = 'flex'; 
    socket.emit('play'); 
    document.getElementById('goal-msg').textContent = "Ищем друга...";
    document.getElementById('goal-msg').style.color = "#fb8500";
    document.getElementById('btn-cancel-search').style.display = 'block';
};

document.getElementById('btn-cancel-search').onclick = () => {
    socket.emit('cancelPlay'); 
    gameWrapper.style.display = 'none'; mainMenu.style.display = 'flex'; updateProfile();
    document.getElementById('btn-cancel-search').style.display = 'none';
    document.getElementById('goal-msg').textContent = ""; 
};

socket.on('showEndScreen', () => { document.getElementById('end-screen').style.display = 'flex'; });
socket.on('hideEndScreen', () => { document.getElementById('end-screen').style.display = 'none'; });

socket.on('opponentLeft', () => {
    socket.emit('leaveMatch'); 
    clientState = null; serverState = null; myRole = null; 
    document.getElementById('game-wrapper').style.display = 'none';
    document.getElementById('end-screen').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
    updateProfile();
});

document.getElementById('btn-new-game').onclick = () => {
    socket.emit('leaveMatch'); 
    clientState = null; serverState = null; myRole = null; 
    document.getElementById('end-screen').style.display = 'none';
    document.getElementById('goal-msg').textContent = "Ищем друга...";
    document.getElementById('btn-cancel-search').style.display = 'block';
    socket.emit('play'); 
};

document.getElementById('btn-leave-match').onclick = () => {
    socket.emit('leaveMatch');
    clientState = null; serverState = null; myRole = null; 
    document.getElementById('game-wrapper').style.display = 'none';
    document.getElementById('end-screen').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
    updateProfile();
};

socket.on('forceReload', () => { window.location.reload(); });

document.getElementById('btn-leaderboard').onclick = () => {
    socket.emit('getLeaderboard', (res) => {
        if (res.success) {
            const list = document.getElementById('leaderboard-list'); list.innerHTML = ''; 
            res.leaderboard.forEach(user => {
                const li = document.createElement('li'); li.style.margin = "8px 0";
                li.innerHTML = `<b>${user.name}</b> — MMR: ${user.rating}`; list.appendChild(li);
            });
            document.getElementById('leaderboard-modal').style.display = 'flex';
        }
    });
};
document.getElementById('btn-close-lb').onclick = () => document.getElementById('leaderboard-modal').style.display = 'none';

// --- ИГРОВАЯ ЛОГИКА ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let serverState = null; let clientState = null; let myRole = null;

socket.on('role', role => myRole = role);
socket.on('goalNotify', data => {
    const msgEl = document.getElementById('goal-msg');
    msgEl.textContent = data.msg; msgEl.style.color = data.color;
});

socket.on('gameStateUpdate', s => {
    serverState = s;
    if (!clientState) clientState = JSON.parse(JSON.stringify(s));
    
    document.getElementById('s1').textContent = s.player1.score;
    document.getElementById('s2').textContent = s.player2.score;
    document.getElementById('r1').textContent = `MMR: ${Math.round(s.player1.rating)}`;
    document.getElementById('r2').textContent = `MMR: ${Math.round(s.player2.rating)}`;
    document.getElementById('n1').textContent = s.player1.name;
    document.getElementById('n2').textContent = s.player2.name;

    if (s.timeLeft !== null && s.timeLeft !== undefined && !s.gameOver) {
        document.getElementById('goal-msg').textContent = `Ждем друга: ${s.timeLeft}с`;
        document.getElementById('goal-msg').style.color = "#ffb703";
    } 
    else if (s.player1.id && s.player2.id && !s.gameOver) {
        document.getElementById('btn-cancel-search').style.display = 'none';
        if (document.getElementById('goal-msg').textContent.includes("Ищем") || document.getElementById('goal-msg').textContent.includes("Ждем")) {
            document.getElementById('goal-msg').textContent = ""; 
        }
    }

    if (s.paused) {
        clientState.player1.x = s.player1.x; clientState.player1.y = s.player1.y;
        clientState.player2.x = s.player2.x; clientState.player2.y = s.player2.y;
    }
});

function sendInput(clientX, clientY) {
    if (!myRole || !clientState || !serverState || serverState.paused || serverState.gameOver) return;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    
    const me = myRole === 'p1' ? 'player1' : 'player2';
    let pR = serverState[me].skin === 'karamelka' ? 43 : (serverState[me].skin === 'gonya' ? 28 : 35);
    let minX = myRole === 'p1' ? pR : 400 + pR;
    let maxX = myRole === 'p1' ? 400 - pR : 800 - pR;
    
    clientState[me].x = Math.min(maxX, Math.max(minX, x));
    clientState[me].y = Math.min(400 - pR, Math.max(pR, y));
    socket.emit('input', { x, y });
}

canvas.addEventListener('mousemove', e => sendInput(e.clientX, e.clientY));
canvas.addEventListener('touchmove', e => { e.preventDefault(); sendInput(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
canvas.addEventListener('touchstart', e => { e.preventDefault(); sendInput(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });

function drawPlayer(x, y, skinName, color) {
    let r = skinName === 'karamelka' ? 43 : (skinName === 'gonya' ? 28 : 35);
    
    if (skinName && skinName !== 'default' && catImages[skinName] && catImages[skinName].complete && catImages[skinName].naturalWidth > 0) {
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip(); 
        ctx.drawImage(catImages[skinName], x - r, y - r, r * 2, r * 2); ctx.restore();
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = color; ctx.stroke();
    } else {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (skinName === 'korzhik') ctx.fillText("КОРЖ", x, y);
        else if (skinName === 'karamelka') ctx.fillText("КАРА", x, y);
        else if (skinName === 'kompot') ctx.fillText("КОМП", x, y);
        else if (skinName === 'gonya') ctx.fillText("ГОНЯ", x, y);
        else { ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
    }
}

// 🔥 НОВОЕ: МУЛЬТЯШНОЕ ПОЛЕ ТРИ КОТА
function render(s) {
    // 1. Светло-голубой лёд
    ctx.fillStyle = '#f4faff'; 
    ctx.fillRect(0, 0, 800, 400);

    // 2. Декорации (Лапки и звездочки)
    ctx.font = '30px Arial';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'; 
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const decor = [
        {t:'🐾', x:120, y:80}, {t:'⭐', x:150, y:320}, {t:'🐾', x:280, y:200},
        {t:'⭐', x:350, y:80}, {t:'🐾', x:400, y:320}, {t:'⭐', x:520, y:200},
        {t:'🐾', x:680, y:80}, {t:'⭐', x:650, y:320}
    ];
    decor.forEach(d => ctx.fillText(d.t, d.x, d.y));

    ctx.lineWidth = 6;
    
    // 3. Зоны ворот (Светло-синяя и светло-красная)
    ctx.fillStyle = 'rgba(77, 166, 255, 0.2)';
    ctx.beginPath(); ctx.arc(0, 200, 100, -Math.PI/2, Math.PI/2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 77, 77, 0.2)';
    ctx.beginPath(); ctx.arc(800, 200, 100, Math.PI/2, -Math.PI/2); ctx.fill();

    // 4. Линии поля
    ctx.strokeStyle = '#ff4d4d'; // Красная в центре
    ctx.beginPath(); ctx.moveTo(400,0); ctx.lineTo(400,400); ctx.stroke();
    ctx.strokeStyle = '#4da6ff'; // Синие зоны
    ctx.beginPath(); ctx.moveTo(250,0); ctx.lineTo(250,400); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(550,0); ctx.lineTo(550,400); ctx.stroke();

    // 5. Центральный круг
    ctx.strokeStyle = '#ff4d4d';
    ctx.beginPath(); ctx.arc(400,200,80,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(400,200,77,0,Math.PI*2); ctx.fill();

    // 6. Три кота в центре круга! (Если загружены картинки)
    const rCat = 22;
    if (catImages['korzhik'].complete && catImages['korzhik'].naturalWidth > 0) {
        ctx.drawImage(catImages['korzhik'], 400 - 45 - rCat, 200 - rCat, rCat*2, rCat*2);
    }
    if (catImages['karamelka'].complete && catImages['karamelka'].naturalWidth > 0) {
        ctx.drawImage(catImages['karamelka'], 400 - rCat, 200 - 35 - rCat, rCat*2, rCat*2);
    }
    if (catImages['kompot'].complete && catImages['kompot'].naturalWidth > 0) {
        ctx.drawImage(catImages['kompot'], 400 + 45 - rCat, 200 - rCat, rCat*2, rCat*2);
    }

    // 7. Сами ворота
    ctx.lineWidth = 12; 
    ctx.strokeStyle = '#4da6ff'; ctx.strokeRect(0, 115, 10, 170);
    ctx.strokeStyle = '#ff4d4d'; ctx.strokeRect(790, 115, 10, 170);

    let px = s.puck.x; let py = s.puck.y;
    if (myRole && !serverState.paused && !serverState.gameOver) {
        const myPlayer = myRole === 'p1' ? s.player1 : s.player2;
        let pR = serverState[myRole === 'p1' ? 'player1' : 'player2'].skin === 'karamelka' ? 43 : (serverState[myRole === 'p1' ? 'player1' : 'player2'].skin === 'gonya' ? 28 : 35);
        let dx = px - myPlayer.x; let dy = py - myPlayer.y; let dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < pR + 22) { px = myPlayer.x + (dx/dist)*(pR+22); py = myPlayer.y + (dy/dist)*(pR+22); }
    }

    // Шайба (Сделали темной, чтобы контрастировала со светлым льдом)
    ctx.beginPath(); ctx.arc(px, py, 22, 0, Math.PI * 2); ctx.fillStyle = '#333'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#111'; ctx.stroke();
    ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.fillStyle = '#666'; ctx.fill();

    drawPlayer(s.player1.x, s.player1.y, serverState.player1.skin, '#4da6ff');
    drawPlayer(s.player2.x, s.player2.y, serverState.player2.skin, '#ff4d4d');
}

function loop() {
    if (serverState && clientState) {
        const lerp = 0.4;
        clientState.puck.x += (serverState.puck.x - clientState.puck.x) * lerp;
        clientState.puck.y += (serverState.puck.y - clientState.puck.y) * lerp;
        const enemy = myRole === 'p1' ? 'player2' : 'player1';
        clientState[enemy].x += (serverState[enemy].x - clientState[enemy].x) * lerp;
        clientState[enemy].y += (serverState[enemy].y - clientState[enemy].y) * lerp;
        render(clientState);
    }
    requestAnimationFrame(loop);
}
loop();