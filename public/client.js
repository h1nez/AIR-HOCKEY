const socket = io({ transports: ["websocket"] }); // Принудительно быстрый протокол
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const msgBox = document.getElementById('msg');

let state = null;

function start() {
    const nick = document.getElementById('nick').value;
    if (nick) {
        socket.emit('join', nick);
        document.getElementById('auth').style.display = 'none';
    }
}

socket.on('goalNotify', d => {
    msgBox.textContent = d.msg;
    msgBox.style.color = d.color;
});

socket.on('gameStateUpdate', s => {
    state = s;
    document.getElementById('s1').textContent = s.player1.score;
    document.getElementById('n1').textContent = s.player1.name;
    document.getElementById('r1').textContent = `MMR: ${Math.round(s.player1.rating)}`;
    document.getElementById('s2').textContent = s.player2.score;
    document.getElementById('n2').textContent = s.player2.name;
    document.getElementById('r2').textContent = `MMR: ${Math.round(s.player2.rating)}`;
});

canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    socket.emit('input', { x: e.clientX - r.left, y: e.clientY - r.top });
});

function loop() {
    if (state) {
        // КЛИЕНТСКОЕ ПРЕДСКАЗАНИЕ: Двигаем шайбу сами между кадрами от сервера
        if (!state.paused) {
            state.puck.x += state.puck.vx;
            state.puck.y += state.puck.vy;
            state.puck.vx *= 0.99;
            state.puck.vy *= 0.99;
        }
        render();
    }
    requestAnimationFrame(loop);
}

function render() {
    ctx.clearRect(0, 0, 800, 400);
    // Поле
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(400,0); ctx.lineTo(400,400); ctx.stroke();
    ctx.beginPath(); ctx.arc(400,200,60,0,Math.PI*2); ctx.stroke();
    // Ворота
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#ccccff'; ctx.strokeRect(0, 125, 4, 150);
    ctx.strokeStyle = '#ffcccc'; ctx.strokeRect(796, 125, 4, 150);
    // Объекты
    drawCircle(state.puck.x, state.puck.y, 15, '#222', true);
    drawCircle(state.player1.x, state.player1.y, 30, '#4444ff');
    drawCircle(state.player2.x, state.player2.y, 30, '#ff4444');
}

function drawCircle(x, y, r, c, puck) {
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = puck ? '#000' : '#fff'; ctx.lineWidth = 3; ctx.stroke();
}

loop(); // Запускаем цикл отрисовки