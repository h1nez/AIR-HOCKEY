// Жестко заставляем браузер использовать быстрые вебсокеты
const socket = io({ transports: ["websocket"] });

// Добавляем отладку, чтобы видеть, подключился ли клиент вообще
socket.on('connect', () => {
    console.log("✅ Успешно подключено к серверу! Мой ID:", socket.id);
});
socket.on('connect_error', (err) => {
    console.error("❌ Ошибка соединения:", err.message);
    document.getElementById('auth-error').innerText = "Нет связи с сервером!";
});
const authScreen = document.getElementById('auth-screen');
const nameInput = document.getElementById('username');
const passInput = document.getElementById('password');
const rememberCb = document.getElementById('remember');
const authError = document.getElementById('auth-error');

const savedName = localStorage.getItem('ah_name');
const savedPass = localStorage.getItem('ah_pass');

if (savedName && savedPass) {
    nameInput.value = savedName;
    passInput.value = savedPass;
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

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let serverState = null;
let clientState = null;
let myRole = null;

socket.on('role', role => myRole = role);
socket.on('goalNotify', data => {
    const msgEl = document.getElementById('goal-msg');
    msgEl.textContent = data.msg;
    msgEl.style.color = data.color;
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

    if (s.paused) {
        clientState.player1.x = s.player1.x; clientState.player1.y = s.player1.y;
        clientState.player2.x = s.player2.x; clientState.player2.y = s.player2.y;
    }
});

function sendInput(clientX, clientY) {
    if (!myRole) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    socket.emit('input', { x, y });
}

canvas.addEventListener('mousemove', e => sendInput(e.clientX, e.clientY));
canvas.addEventListener('touchmove', e => { e.preventDefault(); sendInput(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });

function drawCircle(x, y, r, color, isPuck = false) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = isPuck ? 2 : 4; ctx.strokeStyle = '#000'; ctx.stroke();
    if (!isPuck) { ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.fillStyle = '#222'; ctx.fill(); }
}

function render(s) {
    ctx.clearRect(0, 0, 800, 400);
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(400,0); ctx.lineTo(400,400); ctx.stroke();
    ctx.beginPath(); ctx.arc(400,200,60,0,Math.PI*2); ctx.stroke();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#4444ff'; ctx.strokeRect(0, 125, 5, 150);
    ctx.strokeStyle = '#ff4444'; ctx.strokeRect(795, 125, 5, 150);

    let px = s.puck.x; let py = s.puck.y;
    if (myRole && !serverState.paused) {
        const myPlayer = myRole === 'p1' ? s.player1 : s.player2;
        let dx = px - myPlayer.x; let dy = py - myPlayer.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 57) { px = myPlayer.x + (dx/dist)*57; py = myPlayer.y + (dy/dist)*57; }
    }

    drawCircle(px, py, 22, '#eee', true);
    drawCircle(s.player1.x, s.player1.y, 35, '#4444ff');
    drawCircle(s.player2.x, s.player2.y, 35, '#ff4444');
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