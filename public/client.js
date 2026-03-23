const socket = io({ transports: ["websocket"] });
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const msgBox = document.getElementById('msg');
const pingDisplay = document.getElementById('ping');

let serverState = null; 
let clientState = null; 
let myRole = null; 
let currentPing = 0;

function start() {
    const nick = document.getElementById('nick').value;
    if (nick) { socket.emit('join', nick); document.getElementById('auth').style.display = 'none'; }
}

socket.on('role', r => myRole = r);
socket.on('goalNotify', d => { msgBox.textContent = d.msg; msgBox.style.color = d.color; });

socket.on('gameStateUpdate', s => {
    serverState = s;
    if (!clientState) clientState = JSON.parse(JSON.stringify(s));
    
    // Счёт
    document.getElementById('s1').textContent = s.player1.score;
    document.getElementById('s2').textContent = s.player2.score;
    
    // Рейтинг
    document.getElementById('r1').textContent = `MMR: ${Math.round(s.player1.rating)}`;
    document.getElementById('r2').textContent = `MMR: ${Math.round(s.player2.rating)}`;
    
    // ВЕРНУЛИ НИКИ НА МЕСТО:
    document.getElementById('n1').textContent = s.player1.name;
    document.getElementById('n2').textContent = s.player2.name;
});

canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    if (clientState && myRole && !serverState.paused) {
        const p = (myRole === 'p1') ? clientState.player1 : clientState.player2;
        p.x = (myRole === 'p1') ? Math.min(365, Math.max(35, mx)) : Math.min(765, Math.max(435, mx));
        p.y = Math.min(365, Math.max(35, my));
    }
    socket.emit('input', { x: mx, y: my });
});

function loop() {
    if (serverState && clientState) {
        const lerp = 0.4; // Идеальный баланс плавности и резкости
        
        // Шайба просто плавно догоняет сервер (никаких магнитов)
        clientState.puck.x += (serverState.puck.x - clientState.puck.x) * lerp;
        clientState.puck.y += (serverState.puck.y - clientState.puck.y) * lerp;
        
        // Враг
        const enemy = myRole === 'p1' ? 'player2' : 'player1';
        clientState[enemy].x += (serverState[enemy].x - clientState[enemy].x) * lerp;
        clientState[enemy].y += (serverState[enemy].y - clientState[enemy].y) * lerp;

        render(clientState);
    }
    requestAnimationFrame(loop);
}

function render(s) {
    ctx.clearRect(0, 0, 800, 400);
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(400,0); ctx.lineTo(400,400); ctx.stroke();
    ctx.beginPath(); ctx.arc(400,200,60,0,Math.PI*2); ctx.stroke();
    
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#4444ff'; ctx.strokeRect(0, 125, 5, 150);
    ctx.strokeStyle = '#ff4444'; ctx.strokeRect(795, 125, 5, 150);

    // Легкая защита от наложения только для отрисовки
    let px = s.puck.x;
    let py = s.puck.y;
    if (myRole && !serverState.paused) {
        const myPlayer = myRole === 'p1' ? s.player1 : s.player2;
        let dx = px - myPlayer.x;
        let dy = py - myPlayer.y;
        let dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 57) {
            px = myPlayer.x + (dx/dist)*57;
            py = myPlayer.y + (dy/dist)*57;
        }
    }

    // Рисуем
    drawCircle(px, py, 22, '#333', true);
    drawCircle(s.player1.x, s.player1.y, 35, '#4444ff');
    drawCircle(s.player2.x, s.player2.y, 35, '#ff4444');
}

setInterval(() => {
    const startP = Date.now();
    socket.emit('pingCheck');
    socket.once('pongCheck', () => {
        currentPing = Date.now() - startP;
        if(pingDisplay) {
            pingDisplay.textContent = `Ping: ${currentPing}ms`;
            pingDisplay.style.color = currentPing > 200 ? '#ff4444' : '#00ff00';
        }
    });
}, 1000);


function drawCircle(x,y,r,c,p){
    ctx.fillStyle=c; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=p?'#000':'#fff'; ctx.lineWidth=3; ctx.stroke();
}
loop();