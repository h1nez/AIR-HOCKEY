const socket = io({ transports: ["websocket"] });
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const msgBox = document.getElementById('msg');

let serverState = null; 
let clientState = null; 

function start() {
    const nick = document.getElementById('nick').value;
    if (nick) { socket.emit('join', nick); document.getElementById('auth').style.display = 'none'; }
}

socket.on('goalNotify', d => { msgBox.textContent = d.msg; msgBox.style.color = d.color; });

socket.on('gameStateUpdate', s => {
    serverState = s;
    if (!clientState) clientState = JSON.parse(JSON.stringify(s));
    
    // Обновляем UI
    document.getElementById('s1').textContent = s.player1.score;
    document.getElementById('r1').textContent = `MMR: ${Math.round(s.player1.rating)}`;
    document.getElementById('n1').textContent = s.player1.name;
    document.getElementById('s2').textContent = s.player2.score;
    document.getElementById('r2').textContent = `MMR: ${Math.round(s.player2.rating)}`;
    document.getElementById('n2').textContent = s.player2.name;
});

canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    socket.emit('input', { x: e.clientX - r.left, y: e.clientY - r.top });
});

function loop() {
    if (serverState && clientState) {
        // КОЭФФИЦИЕНТ СГЛАЖИВАНИЯ (0.1 - очень плавно, 0.5 - резче)
        const lerpFactor = 0.15; 
        
        // Плавно подтягиваем шайбу к серверным координатам
        clientState.puck.x += (serverState.puck.x - clientState.puck.x) * lerpFactor;
        clientState.puck.y += (serverState.puck.y - clientState.puck.y) * lerpFactor;
        
        // Плавно подтягиваем игроков
        clientState.player1.x += (serverState.player1.x - clientState.player1.x) * lerpFactor;
        clientState.player1.y += (serverState.player1.y - clientState.player1.y) * lerpFactor;
        clientState.player2.x += (serverState.player2.x - clientState.player2.x) * lerpFactor;
        clientState.player2.y += (serverState.player2.y - clientState.player2.y) * lerpFactor;

        render(clientState);
    }
    requestAnimationFrame(loop);
}

function render(s) {
    ctx.clearRect(0, 0, 800, 400);
    // Поле
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(400,0); ctx.lineTo(400,400); ctx.stroke();
    ctx.beginPath(); ctx.arc(400,200,60,0,Math.PI*2); ctx.stroke();
    // Ворота
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#ccccff'; ctx.strokeRect(0, 125, 4, 150);
    ctx.strokeStyle = '#ffcccc'; ctx.strokeRect(796, 125, 4, 150);

    drawCircle(s.puck.x, s.puck.y, 15, '#222', true);
    drawCircle(s.player1.x, s.player1.y, 30, '#4444ff');
    drawCircle(s.player2.x, s.player2.y, 30, '#ff4444');
}

function drawCircle(x, y, r, c, p) {
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = p ? '#000' : '#fff'; ctx.lineWidth = 3; ctx.stroke();
}

loop();