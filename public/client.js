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
        // 1. УМНЫЙ АНТИ-ЛАГ
        // Если пинг отличный (< 40 мс), мы убираем "желе" (0.8). Шайба будет летать резко и четко.
        // Если пинг плохой (> 40 мс), включаем плавность (0.15).
        const lerp = currentPing < 40 ? 0.8 : 0.15; 
        
        // Экстраполяция тоже нужна только при лагах
        const prediction = currentPing < 40 ? 0 : (currentPing / 40); 
        const targetX = serverState.puck.x + (serverState.puck.vx * prediction);
        const targetY = serverState.puck.y + (serverState.puck.vy * prediction);

        // Тянем шайбу к серверной позиции
        clientState.puck.x += (targetX - clientState.puck.x) * lerp;
        clientState.puck.y += (targetY - clientState.puck.y) * lerp;
        
        // Сглаживание врага
        const enemy = myRole === 'p1' ? 'player2' : 'player1';
        clientState[enemy].x += (serverState[enemy].x - clientState[enemy].x) * lerp;
        clientState[enemy].y += (serverState[enemy].y - clientState[enemy].y) * lerp;

        // 2. ВИЗУАЛЬНЫЕ БАРЬЕРЫ
        let visPuck = { x: clientState.puck.x, y: clientState.puck.y };
        const minDist = 57; // Идеальное соприкосновение клюшки и шайбы
        const PUCK_R = 22;

        // Жесткие бортики (шайба визуально никогда не залетит в стену)
        if (visPuck.y < PUCK_R) visPuck.y = PUCK_R;
        if (visPuck.y > 400 - PUCK_R) visPuck.y = 400 - PUCK_R;

        if (!serverState.paused) {
            // Защита от залезания в СВОЮ клюшку
            const myPlayer = myRole === 'p1' ? clientState.player1 : clientState.player2;
            let dx1 = visPuck.x - myPlayer.x;
            let dy1 = visPuck.y - myPlayer.y;
            let dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
            if (dist1 < minDist) {
                visPuck.x = myPlayer.x + (dx1 / dist1) * minDist;
                visPuck.y = myPlayer.y + (dy1 / dist1) * minDist;
            }

            // Защита от залезания в ЧУЖУЮ клюшку
            let dx2 = visPuck.x - clientState[enemy].x;
            let dy2 = visPuck.y - clientState[enemy].y;
            let dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
            if (dist2 < minDist) {
                visPuck.x = clientState[enemy].x + (dx2 / dist2) * minDist;
                visPuck.y = clientState[enemy].y + (dy2 / dist2) * minDist;
            }
        }

        render(clientState, visPuck);
    }
    requestAnimationFrame(loop);
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

// Теперь отрисовка использует visPuck для шайбы
function render(s, visPuck) {
    ctx.clearRect(0, 0, 800, 400);
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(400,0); ctx.lineTo(400,400); ctx.stroke();
    ctx.beginPath(); ctx.arc(400,200,60,0,Math.PI*2); ctx.stroke();
    
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#4444ff'; ctx.strokeRect(0, 125, 5, 150);
    ctx.strokeStyle = '#ff4444'; ctx.strokeRect(795, 125, 5, 150);

    // Отрисовываем визуально сглаженную шайбу
    drawCircle(visPuck.x, visPuck.y, 22, '#333', true);
    // Игроки остаются на своих местах
    drawCircle(s.player1.x, s.player1.y, 35, '#4444ff');
    drawCircle(s.player2.x, s.player2.y, 35, '#ff4444');
}

function drawCircle(x,y,r,c,p){
    ctx.fillStyle=c; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=p?'#000':'#fff'; ctx.lineWidth=3; ctx.stroke();
}
loop();