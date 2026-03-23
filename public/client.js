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
    authError.innerText = "Автоматический вход..."; authError.style.color = "#4da6ff";
    socket.on('connect', () => { socket.emit('login', { name: savedName, password: savedPass }, handleAuthResponse); });
}

document.getElementById('btn-login').onclick = () => {
    authError.innerText = "Подключение..."; authError.style.color = "#e63946";
    socket.emit('login', { name: nameInput.value, password: passInput.value }, handleAuthResponse);
};
document.getElementById('btn-register').onclick = () => {
    authError.innerText = "Создание..."; authError.style.color = "#e63946";
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
            
            const reqBadge = document.getElementById('req-badge');
            if (data.reqCount > 0) { reqBadge.style.display = 'block'; reqBadge.innerText = data.reqCount; }
            else { reqBadge.style.display = 'none'; }

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

window.showProfile = function(username) {
    socket.emit('getUserProfile', username, (res) => {
        if (res.success) {
            const p = res.profile;
            const skinNames = { 'default': 'Обычный', 'korzhik': 'Коржик', 'karamelka': 'Карамелька', 'kompot': 'Компот', 'gonya': 'Гоня' };
            
            document.getElementById('profile-name').innerText = p.name;
            
            // 🔥 ЗАЩИТА: Если в базе остался старый смайлик, меняем на avatar1
            let av = p.avatar || 'avatar1';
            if (['🐱', '🐶', '🦊', '🐻'].includes(av)) av = 'avatar1';
            document.getElementById('profile-avatar').src = '/' + av + '.png'; // Грузим картинку!

            document.getElementById('profile-mmr').innerText = p.rating;
            document.getElementById('profile-max-mmr').innerText = p.maxRating || 1000;
            document.getElementById('profile-min-mmr').innerText = p.minRating || 1000;
            document.getElementById('profile-skin').innerText = skinNames[p.skin] || 'Обычный';
            
            document.getElementById('profile-played').innerText = p.gamesPlayed || 0;
            document.getElementById('profile-won').innerText = p.gamesWon || 0;
            
            let winrate = p.gamesPlayed > 0 ? Math.round((p.gamesWon / p.gamesPlayed) * 100) : 0;
            document.getElementById('profile-winrate').innerText = winrate + '%';
            
            const date = new Date(p.regDate);
            document.getElementById('profile-regdate').innerText = date.toLocaleDateString('ru-RU');

            if (username === nameInput.value) {
                document.getElementById('avatar-selector').style.display = 'block';
            } else {
                document.getElementById('avatar-selector').style.display = 'none';
            }

            document.getElementById('profile-modal').style.display = 'flex';
        } else {
            alert("Не удалось загрузить профиль");
        }
    });
};

window.setAvatar = function(av) {
    socket.emit('setAvatar', av, (res) => {
        if(res.success) {
            document.getElementById('profile-avatar').src = '/' + av + '.png'; // Меняем картинку
        }
    });
}

document.getElementById('btn-my-profile').onclick = () => { showProfile(nameInput.value); };

// ==========================================
// ЛОГИКА ДРУЗЕЙ
// ==========================================
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    
    if(tabId === 'tab-list') document.querySelectorAll('.tab-btn')[0].classList.add('active');
    if(tabId === 'tab-search') document.querySelectorAll('.tab-btn')[1].classList.add('active');
    if(tabId === 'tab-reqs') document.querySelectorAll('.tab-btn')[2].classList.add('active');
};

document.getElementById('btn-friends').onclick = () => {
    document.getElementById('friends-modal').style.display = 'flex';
    loadFriendsData();
};
document.getElementById('btn-close-friends').onclick = () => { document.getElementById('friends-modal').style.display = 'none'; updateProfile(); };

function loadFriendsData() {
    socket.emit('getFriendsData', (res) => {
        if (!res.success) return;
        
        const list = document.getElementById('friends-list');
        if (res.friends.length === 0) list.innerHTML = "<p style='color:#888;'>У вас пока нет друзей :(</p>";
        else {
            list.innerHTML = res.friends.map(f => `
                <div class="friend-item">
                    <div class="friend-info">${f.name} <br><span class="friend-mmr">MMR: ${f.rating}</span></div>
                    <div style="display:flex; gap:5px;">
                        <button class="btn btn-blue btn-small" onclick="showProfile('${f.name}')">Профиль</button>
                        <button class="btn btn-red btn-small" onclick="removeFriend('${f.name}')">Удалить</button>
                    </div>
                </div>
            `).join('');
        }

		document.getElementById('btn-play').onclick = () => {
			mainMenu.style.display = 'none'; gameWrapper.style.display = 'flex'; 
			socket.emit('play'); 
			document.getElementById('goal-msg').textContent = "Ищем друга...";
			document.getElementById('goal-msg').style.color = "#fb8500";
			document.getElementById('btn-cancel-search').style.display = 'block';
		};

		// 🔥 НОВОЕ: Кнопка тренировки
		document.getElementById('btn-play-bot').onclick = () => {
			mainMenu.style.display = 'none'; gameWrapper.style.display = 'flex'; 
			socket.emit('playBot'); // Отправляем спец-команду серверу
			document.getElementById('goal-msg').textContent = ""; // Бот подключается моментально!
			document.getElementById('btn-cancel-search').style.display = 'none';
		};

window.searchFriends = function() {
    const q = document.getElementById('search-input').value;
    socket.emit('searchUser', q, (res) => {
        const resBox = document.getElementById('search-results');
        if (!res.success || res.users.length === 0) { resBox.innerHTML = "<p style='color:#888;'>Не найдено</p>"; return; }
        
        resBox.innerHTML = res.users.map(u => `
            <div class="friend-item">
                <div class="friend-info">${u.name} <span class="friend-mmr">(MMR: ${u.rating})</span></div>
                <div style="display:flex; gap:5px;">
                    <button class="btn btn-blue btn-small" onclick="showProfile('${u.name}')">Профиль</button>
                    <button class="btn btn-orange btn-small" onclick="sendReq('${u.name}')">Добавить</button>
                </div>
            </div>
        `).join('');
    });
};

window.sendReq = function(name) { socket.emit('sendFriendRequest', name, (res) => alert(res.msg)); };
window.acceptFriend = function(name) { socket.emit('acceptFriend', name, () => loadFriendsData()); };
window.rejectFriend = function(name) { socket.emit('rejectFriend', name, () => loadFriendsData()); };
window.removeFriend = function(name) { if(confirm(`Удалить ${name} из друзей?`)) socket.emit('removeFriend', name, () => loadFriendsData()); };

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

function render(s) {
    ctx.fillStyle = '#f4faff'; ctx.fillRect(0, 0, 800, 400);

    ctx.font = '30px Arial'; ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'; 
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [{t:'🐾', x:120, y:80}, {t:'⭐', x:150, y:320}, {t:'🐾', x:280, y:200}, {t:'⭐', x:350, y:80}, {t:'🐾', x:400, y:320}, {t:'⭐', x:520, y:200}, {t:'🐾', x:680, y:80}, {t:'⭐', x:650, y:320}].forEach(d => ctx.fillText(d.t, d.x, d.y));

    ctx.lineWidth = 6;
    ctx.fillStyle = 'rgba(77, 166, 255, 0.2)'; ctx.beginPath(); ctx.arc(0, 200, 100, -Math.PI/2, Math.PI/2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 77, 77, 0.2)'; ctx.beginPath(); ctx.arc(800, 200, 100, Math.PI/2, -Math.PI/2); ctx.fill();

    ctx.strokeStyle = '#ff4d4d'; ctx.beginPath(); ctx.moveTo(400,0); ctx.lineTo(400,400); ctx.stroke();
    ctx.strokeStyle = '#4da6ff'; ctx.beginPath(); ctx.moveTo(250,0); ctx.lineTo(250,400); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(550,0); ctx.lineTo(550,400); ctx.stroke();

    ctx.strokeStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(400,200,80,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(400,200,77,0,Math.PI*2); ctx.fill();

    const rCat = 22;
    if (catImages['korzhik'].complete && catImages['korzhik'].naturalWidth > 0) ctx.drawImage(catImages['korzhik'], 400 - 45 - rCat, 200 - rCat, rCat*2, rCat*2);
    if (catImages['karamelka'].complete && catImages['karamelka'].naturalWidth > 0) ctx.drawImage(catImages['karamelka'], 400 - rCat, 200 - 35 - rCat, rCat*2, rCat*2);
    if (catImages['kompot'].complete && catImages['kompot'].naturalWidth > 0) ctx.drawImage(catImages['kompot'], 400 + 45 - rCat, 200 - rCat, rCat*2, rCat*2);

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