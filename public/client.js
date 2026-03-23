const socket = io();
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const msgBox = document.getElementById('msg');

function join() {
    const nick = document.getElementById('nickInput').value;
    if (nick.trim()) {
        socket.emit('joinGame', nick);
        document.getElementById('login').style.display = 'none';
    }
}

socket.on('goalNotify', data => {
    if (data.msg) {
        msgBox.textContent = data.msg;
        msgBox.style.color = data.color;
        msgBox.style.display = 'block';
    } else {
        msgBox.style.display = 'none';
    }
});

socket.on('gameStateUpdate', s => {
    // Обновляем UI
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
    
    // Разметка
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(400, 0); ctx.lineTo(400, 400); ctx.stroke();
    ctx.beginPath(); ctx.arc(400, 200, 60, 0, Math.PI*2); ctx.stroke();

    // Ворота
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#ccccff'; ctx.strokeRect(0, 125, 2, 150);
    ctx.strokeStyle = '#ffcccc'; ctx.strokeRect(798, 125, 2, 150);

    // Шайба и игроки
    drawCircle(state.puck.x, state.puck.y, 15, '#222');
    drawCircle(state.player1.x, state.player1.y, 30, '#4444ff');
    drawCircle(state.player2.x, state.player2.y, 30, '#ff4444');
}

function drawCircle(x, y, r, c) {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
}