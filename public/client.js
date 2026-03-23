const socket = io();
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const msgBox = document.getElementById('msg');

function start() {
    const nick = document.getElementById('nick').value;
    if (nick.trim()) {
        socket.emit('join', nick);
        document.getElementById('auth').style.display = 'none';
    }
}

socket.on('goalNotify', d => {
    msgBox.textContent = d.msg;
    msgBox.style.color = d.color;
});

socket.on('gameStateUpdate', s => {
    // Обновляем статистику
    document.getElementById('s1').textContent = s.player1.score;
    document.getElementById('n1').textContent = s.player1.name;
    document.getElementById('r1').textContent = `MMR: ${Math.round(s.player1.rating)}`;

    document.getElementById('s2').textContent = s.player2.score;
    document.getElementById('n2').textContent = s.player2.name;
    document.getElementById('r2').textContent = `MMR: ${Math.round(s.player2.rating)}`;

    render(s);
});

canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    socket.emit('input', { x: e.clientX - r.left, y: e.clientY - r.top });
});

function render(state) {
    ctx.clearRect(0, 0, 800, 400);

    // Разметка поля
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(400, 0); ctx.lineTo(400, 400); ctx.stroke();
    ctx.beginPath(); ctx.arc(400, 200, 60, 0, Math.PI*2); ctx.stroke();

    // Ворота
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#ccccff'; ctx.strokeRect(0, 125, 4, 150); // Левые
    ctx.strokeStyle = '#ffcccc'; ctx.strokeRect(796, 125, 4, 150); // Правые

    // Шайба
    drawCircle(state.puck.x, state.puck.y, 15, '#222', true);
    
    // Игроки
    drawCircle(state.player1.x, state.player1.y, 30, '#4444ff', false);
    drawCircle(state.player2.x, state.player2.y, 30, '#ff4444', false);
}

function drawCircle(x, y, r, c, isPuck) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isPuck ? '#000' : '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();
}