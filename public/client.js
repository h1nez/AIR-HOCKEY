const socket = io();

const catImages = { 'korzhik': new Image(), 'karamelka': new Image(), 'kompot': new Image() };
catImages.korzhik.src = '/korzhik.png'; catImages.karamelka.src = '/karamelka.png'; catImages.kompot.src = '/kompot.png';

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

// 🔥 НОВОЕ: Читаем флаг `rejoining`. Если мы вернулись в матч после обрыва - кидаем сразу в игру!
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
            localStorage.setItem('ah_name', nameInput.value); localStorage.setItem('ah_pass', passInput.value);
        } else {
            localStorage.removeItem('ah_name'); localStorage.removeItem('ah_pass');
        }
    } else {
        authScreen.style.display = 'flex'; authError.innerText = res.msg;
    }
}

function updateProfile() {
    socket.emit('getProfile', (data) => {
        if (data.success) {
            document.getElementById('menu-coins').innerText = `💰 Монеты: ${data.coins}`;
            document.getElementById('shop-coins').innerText = `Ваши монеты: ${data.coins}`;
            ['default', 'korzhik', 'karamelka', 'kompot'].forEach(skin => {
                const el = document.getElementById('skin-' + skin);
                const priceEl = document.getElementById('price-' + skin);
                el.classList.remove('equipped');
                if (data.inventory.includes(skin)) { priceEl.innerText = "Куплено"; priceEl.style.color = "#00ff00"; }
                if (data.skin === skin) { el.classList.add('equipped'); priceEl.innerText = "Надето"; priceEl.style.color = "#00eeff"; }
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

document.getElementById('btn-shop').onclick = () => { updateProfile(); document.getElementById('shop-modal').style.display = 'block'; };
document.getElementById('btn-close-shop').onclick = () => document.getElementById('shop-modal').style.display = 'none';

document.getElementById('btn-play').onclick = () => {
    mainMenu.style.display = 'none'; gameWrapper.style.display = 'flex'; 
    socket.emit('play'); 
    document.getElementById('goal-msg').textContent = "Ожидание соперника...";
    document.getElementById('goal-msg').style.color = "white";
    document.getElementById('btn-cancel-search').style.display = 'block';
};

document.getElementById('btn-cancel-search').onclick = () => {
    socket.emit('cancelPlay'); 
    gameWrapper.style.display = 'none'; mainMenu.style.display = 'flex'; updateProfile();
    document.getElementById('btn-cancel-search').style.display = 'none';
    document.getElementById('goal-msg').textContent = ""; 
};

// --- ЭКРАН ОКОНЧАНИЯ МАТЧА И ОТКЛЮЧЕНИЯ ---
socket.on('showEndScreen', () => {
    document.getElementById('end-screen').style.display = 'flex';
    document.getElementById('end-status').innerText = "Выберите действие:";
});

socket.on('hideEndScreen', () => {
    document.getElementById('end-screen').style.display = 'none';
});

document.getElementById('btn-new-game').onclick = () => {
    socket.emit('leaveMatch'); 
    clientState = null; serverState = null; myRole = null; 
    document.getElementById('end-screen').style.display = 'none';
    document.getElementById('goal-msg').textContent = "Ожидание соперника...";
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

socket.on('forceReload', () => {
    alert("Связь с сервером прервалась 🔌\nСтраница будет обновлена для переподключения.");
    window.location.reload();
});

document.getElementById('btn-leaderboard').onclick = () => {
    socket.emit('getLeaderboard', (res) => {
        if (res.success) {
            const list = document.getElementById('leaderboard-list'); list.innerHTML = ''; 
            res.leaderboard.forEach(user => {
                const li = document.createElement('li'); li.style.margin = "5px 0";
                li.innerHTML = `<b>${user.name}</b> — MMR: ${user.rating}`; list.appendChild(li);
            });
            document.getElementById('leaderboard-modal').style.display = 'block';
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

    // 🔥 НОВОЕ: Вывод таймера переподключения
    if (s.timeLeft !== null && s.timeLeft !== undefined && !s.gameOver) {
        document.getElementById('goal-msg').textContent = `Игрок отключился. Ждем: ${s.timeLeft}с`;
        document.getElementById('goal-msg').style.color = "#ffaa00";
    } 
    else if (s.player1.id && s.player2.id && !s.gameOver) {
        document.getElementById('btn-cancel-search').style.display = 'none';
        if (document.getElementById('goal-msg').textContent.includes("Ожидание") || document.getElementById('goal-msg').textContent.includes("Ждем")) {
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
    clientState[me].x = (myRole === 'p1') ? Math.min(365, Math.max(35, x)) : Math.min(765, Math.max(435, x));
    clientState[me].y = Math.min(365, Math.max(35, y));
    socket.emit('input', { x, y });
}

canvas.addEventListener('mousemove', e => sendInput(e.clientX, e.clientY));
canvas.addEventListener('touchmove', e => { e.preventDefault(); sendInput(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
canvas.addEventListener('touchstart', e => { e.preventDefault(); sendInput(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });

function drawPlayer(x, y, r, color, skinName) {
    if (skinName && skinName !== 'default' && catImages[skinName] && catImages[skinName].complete && catImages[skinName].naturalWidth > 0) {
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip(); 
        ctx.drawImage(catImages[skinName], x - r, y - r, r * 2, r * 2); ctx.restore();
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.lineWidth = 4; ctx.strokeStyle = color; ctx.stroke();
    } else {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (skinName === 'korzhik') ctx.fillText("КОРЖ", x, y);
        else if (skinName === 'karamelka') ctx.fillText("КАРА", x, y);
        else if (skinName === 'kompot') ctx.fillText("КОМП", x, y);
        else { ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.fillStyle = '#222'; ctx.fill(); }
    }
}

function render(s) {
    ctx.clearRect(0, 0, 800, 400);
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(400,0); ctx.lineTo(400,400); ctx.stroke();
    ctx.beginPath(); ctx.arc(400,200,60,0,Math.PI*2); ctx.stroke();
    ctx.lineWidth = 10; ctx.strokeStyle = '#4444ff'; ctx.strokeRect(0, 125, 5, 150);
    ctx.strokeStyle = '#ff4444'; ctx.strokeRect(795, 125, 5, 150);

    let px = s.puck.x; let py = s.puck.y;
    if (myRole && !serverState.paused && !serverState.gameOver) {
        const myPlayer = myRole === 'p1' ? s.player1 : s.player2;
        let dx = px - myPlayer.x; let dy = py - myPlayer.y; let dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 57) { px = myPlayer.x + (dx/dist)*57; py = myPlayer.y + (dy/dist)*57; }
    }

    ctx.beginPath(); ctx.arc(px, py, 22, 0, Math.PI * 2); ctx.fillStyle = '#eee'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();

    drawPlayer(s.player1.x, s.player1.y, 35, '#4444ff', serverState.player1.skin);
    drawPlayer(s.player2.x, s.player2.y, 35, '#ff4444', serverState.player2.skin);
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