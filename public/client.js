const socket = io({ transports: ["websocket"] });
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const msgBox = document.getElementById('msg');
const pingDisplay = document.getElementById('ping');

let serverState = null; 
let clientState = null; 
let myRole = null; 

function start() {
    const nick = document.getElementById('nick').value;
    if (nick) { socket.emit('join', nick); document.getElementById('auth').style.display = 'none'; }
}

socket.on('role', r => myRole = r);
socket.on('goalNotify', d => { msgBox.textContent = d.msg; msgBox.style.color = d.color; });

socket.on('gameStateUpdate', s => {
    serverState = s;
    if (!clientState) clientState = JSON.parse(JSON.stringify(s));
    
    document.getElementById('s1').textContent = s.player1.score;
    document.getElementById('n1').textContent = s.player1.name;
    document.getElementById('r1').textContent = `MMR: ${Math.round(s.player1.rating)}`;
    document.getElementById('s2').textContent = s.player2.score;
    document.getElementById('n2').textContent = s.player2.name;
    document.getElementById('r2').textContent = `MMR: ${Math.round(s.player2.rating)}`;
});

canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;

    if (clientState && myRole && !serverState.paused) {
        if (myRole === 'p1') {
            clientState.player1.x = Math.min(365, Math.max(35, mx));
            clientState.player1.y = Math.min(365, Math.max(35, my));
        } else {
            clientState.player2.x = Math.min(765, Math.max(435, mx));
            clientState.player2.y = Math.min(365, Math.max(35, my));
        }
    }
    socket.emit('input', { x: mx, y: my });
});

function loop() {
    if (serverState && clientState) {
        const lerp = 0.2; 
        clientState.puck.x += (serverState.puck.x - clientState.puck.x) * lerp;
        clientState.puck.y += (serverState.puck.y - clientState.puck.y) * lerp;
        
        if (myRole === 'p1') {
            clientState.player2.x += (serverState.player2.x - clientState.player2.x) * lerp;
            clientState.player2.y += (serverState.player2.y - clientState.player2.y) * lerp;
        } else {
            clientState.player1.x += (serverState.player1.x - clientState.player1.x) * lerp;
            clientState.player1.y += (serverState.player1.y - clientState.player1.y) * lerp;
        }
        render(clientState);
    }
    requestAnimationFrame(loop);
}

setInterval(() => {
    const startP = Date.now();
    socket.emit('pingCheck');
    socket.once('pongCheck', () => {
        if(pingDisplay) pingDisplay.textContent = `Ping: ${Date.now() - startP}ms`;
    });
}, 2000);

function render(s) {
    ctx.clearRect(0, 0, 800, 400);
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(400,0); ctx.lineTo(400,400); ctx.stroke();
    ctx.beginPath(); ctx.arc(400,200,60,0,Math.PI*2); ctx.stroke();
    
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#4444ff'; ctx.strokeRect(0, 125, 5, 150);
    ctx.strokeStyle = '#ff4444'; ctx.strokeRect(795, 125, 5, 150);

    drawCircle(s.puck.x, s.puck.y, 22, '#333', true);
    drawCircle(s.player1.x, s.player1.y, 35, '#4444ff');
    drawCircle(s.player2.x, s.player2.y, 35, '#ff4444');
}

function drawCircle(x, y, r, c, p) {
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = p ? '#000' : '#fff'; ctx.lineWidth = 3; ctx.stroke();
}
loop();