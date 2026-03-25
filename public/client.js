const socket = io();

// ==========================================
// 🔥 ДАННЫЕ МАГАЗИНА (Должны быть сверху!)
// ==========================================
let userInventory = ['default'];
let userCurrentSkin = 'default';
let shopIndex = 0;

const shopItems = [
    { id: 'default', name: 'Обычный', boost: 'Нет бонусов', price: 0, color: '#4da6ff' },
    { id: 'korzhik', name: 'Коржик', boost: 'Сильный удар', price: 50, color: '#fb8500' },
    { id: 'karamelka', name: 'Карамелька', boost: 'Супер-скорость', price: 50, color: '#e63946' },
    { id: 'kompot', name: 'Компот', boost: 'Большая клюшка', price: 50, color: '#06d6a0' },
    { id: 'gonya', name: 'Гоня 👽', boost: 'Меткий и бешеный!', price: 75, color: '#8338ec' }
];

// ==========================================
// 🔥 АССЕТЫ И ЗВУКИ
// ==========================================
const catImages = {
    'korzhik': new Image(),
    'karamelka': new Image(),
    'kompot': new Image(),
    'gonya': new Image()
};
catImages.korzhik.src = '/korzhik.png';
catImages.karamelka.src = '/karamelka.png';
catImages.kompot.src = '/kompot.png';
catImages.gonya.src = '/gonya.png';

const sndHit = new Audio('/hit.mp3');
const sndWall = new Audio('/wall.mp3');
const sndGoalWin = new Audio('/goal_win.mp3');
const sndGoalLose = new Audio('/goal_lose.mp3');

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
window.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
});

function playPop() {
    if (audioCtx.state === 'suspended') return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

function playSound(audioObj) {
    if (!audioObj.src || audioObj.src.includes('undefined')) return;
    const clone = audioObj.cloneNode();
    clone.volume = 0.5;
    clone.play().catch(() => {});
}

function playHit() { playSound(sndHit); }
function playWall() { playSound(sndWall); }
function playGoalWin() { playSound(sndGoalWin); }
function playGoalLose() { playSound(sndGoalLose); }

// ==========================================
// 🔥 ВИЗУАЛЬНЫЕ ЭФФЕКТЫ И УРОВНИ
// ==========================================
let puckTrail = [];
let confetti = [];
let activeEmojis = [];

function getLvlHtml(elo) {
    let lvl = 1, cls = 'lvl-1';
    if (elo >= 800 && elo < 900) { lvl = 2; cls = 'lvl-2'; }
    else if (elo >= 900 && elo < 1000) { lvl = 3; cls = 'lvl-3'; }
    else if (elo >= 1000 && elo < 1100) { lvl = 4; cls = 'lvl-4'; }
    else if (elo >= 1100 && elo < 1200) { lvl = 5; cls = 'lvl-5'; }
    else if (elo >= 1200 && elo < 1300) { lvl = 6; cls = 'lvl-6'; }
    else if (elo >= 1300 && elo < 1400) { lvl = 7; cls = 'lvl-7'; }
    else if (elo >= 1400 && elo < 1500) { lvl = 8; cls = 'lvl-8'; }
    else if (elo >= 1500 && elo < 1600) { lvl = 9; cls = 'lvl-9'; }
    else if (elo >= 1600) { lvl = 10; cls = 'lvl-10'; }
    return `<span class="lvl-badge ${cls}">${lvl}</span>`;
}

function spawnConfetti() {
    for (let i = 0; i < 100; i++) {
        confetti.push({
            x: 400, y: 200,
            vx: (Math.random() - 0.5) * 25, vy: (Math.random() - 0.5) * 25,
            color: `hsl(${Math.random() * 360}, 100%, 50%)`,
            size: Math.random() * 8 + 4, life: 1
        });
    }
}

// ==========================================
// 🔥 АВТОРИЗАЦИЯ И МЕНЮ
// ==========================================
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
    nameInput.value = savedName;
    passInput.value = savedPass;
    authError.innerText = "Автоматический вход...";
    authError.style.color = "#4da6ff";
    
    const doAutoLogin = () => { socket.emit('login', { name: savedName, password: savedPass }, handleAuthResponse); };
    if (socket.connected) { doAutoLogin(); } else { socket.on('connect', doAutoLogin); }
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
        authScreen.style.display = 'flex';
        authError.innerText = res.msg;
    }
}

// ==========================================
// 🔥 ГЛОБАЛЬНЫЙ ЧАТ
// ==========================================
const chatContainer = document.getElementById('global-chat');
const chatHeader = document.getElementById('chat-header');
const chatToggleIcon = document.getElementById('chat-toggle-icon');
const chatInput = document.getElementById('chat-input');
const chatMsgs = document.getElementById('chat-messages');

chatHeader.onclick = () => {
    chatContainer.classList.toggle('collapsed');
    if (chatContainer.classList.contains('collapsed')) {
        chatToggleIcon.innerText = '▲';
    } else {
        chatToggleIcon.innerText = '▼';
        chatMsgs.scrollTop = chatMsgs.scrollHeight;
    }
};

document.getElementById('btn-send-chat').onclick = sendChat;
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat(); });

function sendChat() {
    const msg = chatInput.value.trim();
    if (msg) {
        socket.emit('globalChat', msg);
        chatInput.value = '';
    }
}

socket.on('chatMessage', (data) => {
    const el = document.createElement('div');
    const isMe = data.name.includes(nameInput.value);
    const nameColor = isMe ? '#4da6ff' : '#ffb703';
    el.innerHTML = `<b style="color: ${nameColor};">${data.name}:</b> <span style="color: #333;">${data.msg}</span>`;
    chatMsgs.appendChild(el);
    setTimeout(() => { chatMsgs.scrollTop = chatMsgs.scrollHeight; }, 50);
});

// ==========================================
// 🔥 ПРОФИЛЬ, АДМИНКА, ПОДАРКИ
// ==========================================
function updateProfile() {
    socket.emit('getProfile', (data) => {
        if (data.success) {
            document.getElementById('menu-coins').innerText = `💰 Монеты: ${data.coins}`;
            document.getElementById('shop-coins').innerText = `Ваши монеты: ${data.coins}`;
            
            const reqBadge = document.getElementById('req-badge');
            if (data.reqCount > 0) { reqBadge.style.display = 'block'; reqBadge.innerText = data.reqCount; } 
            else { reqBadge.style.display = 'none'; }
            
            userInventory = data.inventory; userCurrentSkin = data.skin; renderShopItem();
            if (data.title) { document.getElementById('title-selector').value = data.title; }
            if (data.isAdmin) { document.getElementById('btn-admin').style.display = 'inline-block'; } 
            else { document.getElementById('btn-admin').style.display = 'none'; }
        }
    });
}

document.getElementById('btn-admin').onclick = () => { loadAdminUsers(); document.getElementById('admin-modal').style.display = 'flex'; };
document.getElementById('btn-close-admin').onclick = () => { document.getElementById('admin-modal').style.display = 'none'; };

window.loadAdminUsers = function() {
    socket.emit('adminGetUsers', (res) => {
        if (!res.success) return;
        const list = document.getElementById('admin-users-list');
        list.innerHTML = res.users.map(u => {
            // 🔥 Вот тут мы проверяем онлайн и ставим точку!
            const onlineDot = u.isOnline ? '<span style="color: #06d6a0;" title="В сети">🟢</span>' : '<span style="color: #ccc;" title="Оффлайн">⚪</span>';
            const rowBg = u.isOnline ? 'background: #f4fff8;' : '';
            return `
            <tr style="border-bottom: 1px solid #eee; ${rowBg}">
                <td style="padding: 5px;">
                    ${onlineDot} <b>${u.name}</b><br>
                    <span style="font-size:10px;color:#888;">IP: ${u.regIp || 'Скрыт'}</span>
                </td>
                <td style="padding: 5px; font-weight: bold; color: #fb8500;">${u.rating}</td>
                <td style="padding: 5px; font-weight: bold; color: #06d6a0;">${u.coins}</td>
                <td style="padding: 5px; display:flex; gap:5px; flex-wrap: wrap;">
                    <button class="btn btn-green btn-small" onclick="adminAction('${u.name}', 'addCoins')">💰</button>
                    <button class="btn btn-orange btn-small" onclick="adminAction('${u.name}', 'setElo')">🏆</button>
                    <button class="btn btn-red btn-small" onclick="adminAction('${u.name}', 'ban')">БАН</button>
                </td>
            </tr>`;
        }).join('');
    });
};
window.adminAction = function(targetName, action) {
    let amount = 0;
    if (action === 'addCoins') { amount = prompt(`Сколько монет дать ${targetName}?`); if (amount === null || isNaN(amount) || amount === "") return; } 
    else if (action === 'setElo') { amount = prompt(`Новое ЭЛО для ${targetName}:`); if (amount === null || isNaN(amount) || amount === "") return; } 
    else if (action === 'ban') { if (!confirm(`Вы точно хотите удалить аккаунт ${targetName} НАВСЕГДА?`)) return; }

    socket.emit('adminAction', { targetName, action, amount }, (res) => {
        alert(res.msg); if (res.success) loadAdminUsers();
    });
};

window.showProfile = function(username) {
    socket.emit('getUserProfile', username, (res) => {
        if (res.success) {
            const p = res.profile;
            const skinNames = { 'default': 'Обычный', 'korzhik': 'Коржик', 'karamelka': 'Карамелька', 'kompot': 'Компот', 'gonya': 'Гоня' };
            
            document.getElementById('profile-name').innerText = p.name;
            const statusDot = document.getElementById('profile-online-status');
            if (res.isOnline) { statusDot.style.backgroundColor = '#06d6a0'; statusDot.style.boxShadow = '0 0 8px #06d6a0'; statusDot.title = 'В сети'; } 
            else { statusDot.style.backgroundColor = '#ccc'; statusDot.style.boxShadow = 'none'; statusDot.title = 'Не в сети'; }

            const titleLabel = document.getElementById('profile-title-display');
            if (p.title) { titleLabel.innerText = `[${p.title}]`; titleLabel.style.display = 'block'; } else { titleLabel.style.display = 'none'; }
            const clanLabel = document.getElementById('profile-clan-name');
            if (p.clan) { clanLabel.innerText = `🛡️ Клан: ${p.clan}`; clanLabel.style.display = 'block'; } else { clanLabel.style.display = 'none'; }
            
            let av = p.avatar || 'avatar1'; if (['🐱', '🐶', '🦊', '🐻'].includes(av)) av = 'avatar1';
            document.getElementById('profile-avatar').src = '/' + av + '.png';
            document.getElementById('profile-mmr').innerHTML = `${getLvlHtml(p.rating)} ${p.rating}`;
            document.getElementById('profile-max-mmr').innerHTML = `${getLvlHtml(p.maxRating || 1000)} ${p.maxRating || 1000}`;
            document.getElementById('profile-min-mmr').innerHTML = `${getLvlHtml(p.minRating || 1000)} ${p.minRating || 1000}`;
            document.getElementById('profile-skin').innerText = skinNames[p.skin] || 'Обычный';
            document.getElementById('profile-played').innerText = p.gamesPlayed || 0;
            document.getElementById('profile-won').innerText = p.gamesWon || 0;
            
            let winrate = p.gamesPlayed > 0 ? Math.round((p.gamesWon / p.gamesPlayed) * 100) : 0;
            document.getElementById('profile-winrate').innerText = winrate + '%';
            document.getElementById('profile-regdate').innerText = new Date(p.regDate).toLocaleDateString('ru-RU');

            const giftBtn = document.getElementById('btn-gift');
            if (username === nameInput.value) {
                document.getElementById('profile-edit-section').style.display = 'block';
                document.getElementById('btn-logout').style.display = 'block';
                giftBtn.style.display = 'none';
            } else {
                document.getElementById('profile-edit-section').style.display = 'none';
                document.getElementById('btn-logout').style.display = 'none';
                giftBtn.style.display = 'block';
                giftBtn.onclick = () => {
                    const amount = prompt(`Сколько монет вы хотите подарить игроку ${p.name}?`);
                    if (amount && !isNaN(amount) && amount > 0) {
                        socket.emit('sendGift', { targetName: p.name, amount: amount }, (giftRes) => { alert(giftRes.msg); if (giftRes.success) updateProfile(); });
                    }
                };
            }
            document.getElementById('profile-modal').style.display = 'flex';
        } else { alert("Не удалось загрузить профиль"); }
    });
};

window.setAvatar = function(av) { socket.emit('setAvatar', av, (res) => { if (res.success) document.getElementById('profile-avatar').src = '/' + av + '.png'; }); };
window.setMyTitle = function(title) { socket.emit('setTitle', title, () => updateProfile()); };
document.getElementById('btn-my-profile').onclick = () => { showProfile(nameInput.value); };
document.getElementById('btn-logout').onclick = () => { if (confirm("Выйти из аккаунта?")) { localStorage.removeItem('ah_name'); localStorage.removeItem('ah_pass'); window.location.reload(); } };

// ==========================================
// 🔥 СИСТЕМА КЛАНОВ
// ==========================================
document.getElementById('btn-clans').onclick = () => { document.getElementById('clans-modal').style.display = 'flex'; loadMyClan(); };
document.getElementById('btn-close-clans').onclick = () => { document.getElementById('clans-modal').style.display = 'none'; };
socket.on('clanUpdated', () => { if (document.getElementById('clans-modal').style.display === 'flex') loadMyClan(); });

function loadMyClan() {
    socket.emit('getClanData', (res) => {
        if (res.success && res.clan) {
            document.getElementById('no-clan-block').style.display = 'none'; document.getElementById('my-clan-block').style.display = 'block';
            const clan = res.clan; const privStr = clan.isPrivate ? ' (Закрытый 🔒)' : '';
            document.getElementById('clan-modal-title').innerText = `🛡️ Клан: ${clan.name}${privStr}`;
            document.getElementById('clan-count').innerText = `(${clan.members.length}/${clan.maxMembers})`;
            
            const myName = nameInput.value; const isLeader = clan.leader === myName; const isDeputy = clan.deputies.includes(myName);
            if (isLeader || isDeputy) { document.getElementById('clan-invite-block').style.display = 'block'; } else { document.getElementById('clan-invite-block').style.display = 'none'; }
            
            let html = '';
            clan.members.forEach(member => {
                let roleIcon = ''; let controls = '';
                const isTargetLeader = clan.leader === member; const isTargetDeputy = clan.deputies.includes(member);
                if (isTargetLeader) roleIcon = '👑'; else if (isTargetDeputy) roleIcon = '⭐'; else roleIcon = '👤';
                if (member !== myName) {
                    if (isLeader) {
                        if (isTargetDeputy) controls += `<button class="btn-promo" onclick="clanAction('${member}', 'demote')">⬇ Зам</button>`;
                        else controls += `<button class="btn-promo" onclick="clanAction('${member}', 'promote')">⬆ Зам</button>`;
                        controls += `<button class="btn-kick" onclick="clanAction('${member}', 'kick')">Кик</button>`;
                    } else if (isDeputy && !isTargetLeader && !isTargetDeputy) {
                        controls += `<button class="btn-kick" onclick="clanAction('${member}', 'kick')">Кик</button>`;
                    }
                }
                html += `<div class="clan-member-row"><span style="cursor:pointer;" onclick="showProfile('${member}')">${roleIcon} <b>${member}</b></span><div class="clan-controls">${controls}</div></div>`;
            });
            document.getElementById('clan-members-list').innerHTML = html;
            
            const chatBox = document.getElementById('clan-chat-msgs');
            chatBox.innerHTML = clan.chat.map(c => { const color = c.name.includes(myName) ? '#4da6ff' : '#8338ec'; return `<div style="margin-bottom:4px;"><b style="color:${color}">${c.name}:</b> ${c.msg}</div>`; }).join('');
            chatBox.scrollTop = chatBox.scrollHeight;

        } else {
            document.getElementById('no-clan-block').style.display = 'block'; document.getElementById('my-clan-block').style.display = 'none';
            document.getElementById('clan-modal-title').innerText = `🛡️ Система Кланов`;
            
            const invList = document.getElementById('clan-invites-list');
            if (res.invites && res.invites.length > 0) {
                invList.innerHTML = `<h4 style="margin: 0 0 5px 0; color: #8338ec;">📩 Ваши приглашения:</h4>` + res.invites.map(inv => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:5px 10px; background:#f4faff; border:2px solid #8ecae6; border-radius:10px; margin-bottom:5px;">
                        <b style="font-size: 16px;">${inv}</b>
                        <div style="display:flex; gap: 5px;"><button class="btn btn-green btn-small" onclick="acceptClanInvite('${inv}')">✔ Вступить</button><button class="btn btn-red btn-small" onclick="rejectClanInvite('${inv}')">✖</button></div>
                    </div>
                `).join('');
            } else { invList.innerHTML = ''; }
            loadClansList();
        }
    });
}

function loadClansList() {
    socket.emit('searchClans', (res) => {
        if (res.success) {
            const list = document.getElementById('clan-search-list');
            if (res.clans.length === 0) list.innerHTML = "<p style='color:#888; font-size:14px;'>Свободных кланов пока нет.</p>";
            else {
                list.innerHTML = res.clans.map(c => {
                    let btnHtml = c.isPrivate ? `<span style="color:#e63946; font-size: 12px; font-weight:bold;">🔒 Закрытый</span>` : `<button class="btn btn-green btn-small" onclick="joinClan('${c.name}')">Войти</button>`;
                    return `<div style="display:flex; justify-content:space-between; align-items:center; padding: 5px; border-bottom: 1px dashed #ccc;"><div style="font-size:14px;"><b>${c.name}</b> <br><span style="color:#888;font-size:12px;">(${c.members.length}/${c.maxMembers}) Лидер: ${c.leader}</span></div>${btnHtml}</div>`;
                }).join('');
            }
        }
    });
}

window.createClan = function() {
    const name = document.getElementById('new-clan-name').value.trim(); const maxMembers = document.getElementById('new-clan-size').value; const isPrivate = document.getElementById('new-clan-private').checked;
    if (!name) return alert("Введите название клана!");
    socket.emit('createClan', { name, maxMembers, isPrivate }, (res) => { alert(res.msg); if (res.success) loadMyClan(); });
};

window.joinClan = function(clanName) { socket.emit('joinClan', clanName, (res) => { alert(res.msg); if (res.success) loadMyClan(); }); };
window.inviteToClan = function() { const targetName = document.getElementById('clan-invite-input').value.trim(); if (!targetName) return; socket.emit('inviteToClan', targetName, (res) => { alert(res.msg); if (res.success) document.getElementById('clan-invite-input').value = ''; }); };
window.leaveClan = function() { if(confirm("Вы уверены, что хотите покинуть клан?")) { socket.emit('leaveClan', (res) => { if (res.success) loadMyClan(); }); } };
window.clanAction = function(targetName, action) { let msg = action === 'kick' ? `Выгнать ${targetName} из клана?` : `Изменить права ${targetName}?`; if (confirm(msg)) { socket.emit('clanAction', { targetName, action }, (res) => { if (res.msg) alert(res.msg); if (res.success) loadMyClan(); }); } };
window.sendClanChat = function() { const input = document.getElementById('clan-chat-input'); const msg = input.value.trim(); if (msg) { socket.emit('sendClanChat', msg); input.value = ''; } };

socket.on('newClanMsg', (chatMsg) => {
    if (document.getElementById('clans-modal').style.display === 'flex') {
        const chatBox = document.getElementById('clan-chat-msgs'); const color = chatMsg.name.includes(nameInput.value) ? '#4da6ff' : '#8338ec';
        const msgDiv = document.createElement('div'); msgDiv.style.marginBottom = '4px'; msgDiv.innerHTML = `<b style="color:${color}">${chatMsg.name}:</b> ${chatMsg.msg}`;
        chatBox.appendChild(msgDiv); chatBox.scrollTop = chatBox.scrollHeight;
    }
});

let currentClanInviter = "";
socket.on('incomingClanInvite', (clanName) => {
    currentClanInviter = clanName; document.getElementById('clan-invite-name').innerText = clanName; document.getElementById('clan-invite-modal').style.display = 'flex';
    if (document.getElementById('clans-modal').style.display === 'flex') loadMyClan();
});
document.getElementById('btn-accept-clan-invite').onclick = () => { acceptClanInvite(currentClanInviter); document.getElementById('clan-invite-modal').style.display = 'none'; };
document.getElementById('btn-decline-clan-invite').onclick = () => { rejectClanInvite(currentClanInviter); document.getElementById('clan-invite-modal').style.display = 'none'; };
window.acceptClanInvite = function(clanName) { socket.emit('acceptClanInvite', clanName, (res) => { alert(res.msg); if (res.success) loadMyClan(); }); };
window.rejectClanInvite = function(clanName) { socket.emit('rejectClanInvite', clanName, (res) => { loadMyClan(); }); };

// ==========================================
// 🔥 ДРУЗЬЯ И ЗРИТЕЛИ
// ==========================================
window.switchTab = function(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active')); document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active')); document.getElementById(tabId).classList.add('active');
    if (tabId === 'tab-list') document.querySelectorAll('.tab-btn')[0].classList.add('active'); if (tabId === 'tab-search') document.querySelectorAll('.tab-btn')[1].classList.add('active'); if (tabId === 'tab-reqs') document.querySelectorAll('.tab-btn')[2].classList.add('active');
};

document.getElementById('btn-friends').onclick = () => { document.getElementById('friends-modal').style.display = 'flex'; loadFriendsData(); };
document.getElementById('btn-close-friends').onclick = () => { document.getElementById('friends-modal').style.display = 'none'; updateProfile(); };

function loadFriendsData() {
    socket.emit('getFriendsData', (res) => {
        if (!res.success) return;
        const list = document.getElementById('friends-list');
        if (res.friends.length === 0) { list.innerHTML = "<p style='color:#888;'>У вас пока нет друзей :(</p>"; } 
        else {
            list.innerHTML = res.friends.map(f => {
                let actionBtn = f.inGameRoom ? `<button class="btn btn-purple btn-small" onclick="spectateRoom('${f.inGameRoom}')">👀 Смотреть</button>` : `<button class="btn btn-green btn-small" onclick="inviteFriendToMatch('${f.name}')">⚔️ Играть</button>`;
                return `<div class="friend-item"><div class="friend-info">${f.name} <br><span class="friend-mmr">ЭЛО: ${getLvlHtml(f.rating)} ${f.rating}</span></div><div style="display:flex; gap:5px;">${actionBtn}<button class="btn btn-blue btn-small" onclick="showProfile('${f.name}')">Профиль</button><button class="btn btn-red btn-small" onclick="removeFriend('${f.name}')">Удалить</button></div></div>`;
            }).join('');
        }
        const reqList = document.getElementById('requests-list'); document.getElementById('req-count').innerText = res.requests.length > 0 ? `(${res.requests.length})` : '';
        if (res.requests.length === 0) reqList.innerHTML = "<p style='color:#888;'>Нет новых запросов</p>";
        else reqList.innerHTML = res.requests.map(r => `<div class="friend-item"><div class="friend-info">${r}</div><div><button class="btn btn-green btn-small" onclick="acceptFriend('${r}')">✔</button><button class="btn btn-red btn-small" onclick="rejectFriend('${r}')">✖</button></div></div>`).join('');
    });
}

window.searchFriends = function() { const q = document.getElementById('search-input').value; socket.emit('searchUser', q, (res) => { const resBox = document.getElementById('search-results'); if (!res.success || res.users.length === 0) { resBox.innerHTML = "<p style='color:#888;'>Не найдено</p>"; return; } resBox.innerHTML = res.users.map(u => `<div class="friend-item"><div class="friend-info">${u.name} <span class="friend-mmr">(ЭЛО: ${getLvlHtml(u.rating)} ${u.rating})</span></div><div style="display:flex; gap:5px;"><button class="btn btn-blue btn-small" onclick="showProfile('${u.name}')">Профиль</button><button class="btn btn-orange btn-small" onclick="sendReq('${u.name}')">Добавить</button></div></div>`).join(''); }); };
window.sendReq = function(name) { socket.emit('sendFriendRequest', name, (res) => alert(res.msg)); }; window.acceptFriend = function(name) { socket.emit('acceptFriend', name, () => loadFriendsData()); }; window.rejectFriend = function(name) { socket.emit('rejectFriend', name, () => loadFriendsData()); }; window.removeFriend = function(name) { if (confirm(`Удалить ${name} из друзей?`)) socket.emit('removeFriend', name, () => loadFriendsData()); }; window.inviteFriendToMatch = function(name) { socket.emit('inviteFriend', name, (res) => { alert(res.msg); }); };

window.spectateRoom = function(roomId) {
    document.querySelectorAll('.overlay').forEach(el => el.style.display = 'none');
    mainMenu.style.display = 'none'; gameWrapper.style.display = 'flex';
    document.getElementById('goal-msg').textContent = "Подключение к трансляции..."; document.getElementById('goal-msg').style.color = "#8338ec";
    document.getElementById('btn-cancel-search').style.display = 'none'; document.getElementById('btn-in-game-quit').style.display = 'block';
    socket.emit('spectate', roomId);
};

let currentInviter = "";
socket.on('incomingInvite', (senderName) => { currentInviter = senderName; document.getElementById('invite-sender-name').innerText = senderName; document.getElementById('invite-modal').style.display = 'flex'; });
document.getElementById('btn-accept-invite').onclick = () => { socket.emit('acceptInvite', currentInviter); document.getElementById('invite-modal').style.display = 'none'; }; document.getElementById('btn-decline-invite').onclick = () => { socket.emit('declineInvite', currentInviter); document.getElementById('invite-modal').style.display = 'none'; }; socket.on('inviteDeclined', (name) => { alert(`Игрок ${name} отклонил приглашение.`); });
socket.on('forceStartGame', () => { document.querySelectorAll('.overlay').forEach(el => el.style.display = 'none'); mainMenu.style.display = 'none'; gameWrapper.style.display = 'flex'; document.getElementById('goal-msg').textContent = ""; document.getElementById('btn-cancel-search').style.display = 'none'; document.getElementById('btn-in-game-quit').style.display = 'block'; });

// ==========================================
// 🔥 МАГАЗИН СКИНОВ И РЕЖИМЫ ИГРЫ
// ==========================================
function renderShopItem() {
    const item = shopItems[shopIndex];
    document.getElementById('shop-item-name').innerText = item.name; document.getElementById('shop-item-boost').innerText = item.boost;
    const border = document.getElementById('shop-item-preview-border'); const img = document.getElementById('shop-item-preview'); const text = document.getElementById('shop-item-preview-text');
    border.style.borderColor = item.color;
    if (item.id === 'default') { img.style.display = 'none'; text.style.display = 'block'; border.style.background = item.color; } else { img.style.display = 'block'; text.style.display = 'none'; img.src = `/${item.id}.png`; border.style.background = '#f4faff'; }
    const actionBtn = document.getElementById('btn-shop-action'); const priceText = document.getElementById('shop-item-price');
    if (userCurrentSkin === item.id) { priceText.innerText = "Надето"; priceText.style.color = "#219ebc"; actionBtn.innerText = "ВЫБРАНО"; actionBtn.className = "btn btn-blue"; actionBtn.disabled = true; } 
    else if (userInventory.includes(item.id)) { priceText.innerText = "В инвентаре"; priceText.style.color = "#06d6a0"; actionBtn.innerText = "НАДЕТЬ"; actionBtn.className = "btn btn-green"; actionBtn.disabled = false; actionBtn.onclick = () => window.buySkin(item.id); } 
    else { priceText.innerText = item.price > 0 ? `${item.price} монет` : "Бесплатно"; priceText.style.color = "#fb8500"; actionBtn.innerText = "КУПИТЬ"; actionBtn.className = "btn btn-orange"; actionBtn.disabled = false; actionBtn.onclick = () => window.buySkin(item.id); }
}

document.getElementById('btn-shop-prev').onclick = () => { shopIndex = (shopIndex - 1 + shopItems.length) % shopItems.length; document.getElementById('shop-error').innerText = ""; renderShopItem(); };
document.getElementById('btn-shop-next').onclick = () => { shopIndex = (shopIndex + 1) % shopItems.length; document.getElementById('shop-error').innerText = ""; renderShopItem(); };
window.buySkin = function(skinName) { socket.emit('buySkin', skinName, (res) => { if (res.success) { document.getElementById('shop-error').innerText = ""; updateProfile(); } else { document.getElementById('shop-error').innerText = res.msg; } }); };
document.getElementById('btn-shop').onclick = () => { updateProfile(); document.getElementById('shop-modal').style.display = 'flex'; };
document.getElementById('btn-close-shop').onclick = () => { document.getElementById('shop-modal').style.display = 'none'; };

document.getElementById('btn-play-menu').onclick = () => { document.getElementById('play-modal').style.display = 'flex'; };
document.getElementById('btn-close-play-modal').onclick = () => { document.getElementById('play-modal').style.display = 'none'; };

document.getElementById('btn-play').onclick = () => {
    document.getElementById('play-modal').style.display = 'none'; mainMenu.style.display = 'none'; gameWrapper.style.display = 'flex'; socket.emit('play');
    document.getElementById('goal-msg').textContent = "Ищем друга..."; document.getElementById('goal-msg').style.color = "#fb8500";
    document.getElementById('btn-cancel-search').style.display = 'block'; document.getElementById('btn-in-game-quit').style.display = 'none';
};

document.getElementById('btn-play-bot').onclick = () => {
    document.getElementById('play-modal').style.display = 'none'; mainMenu.style.display = 'none'; gameWrapper.style.display = 'flex'; socket.emit('playBot');
    document.getElementById('goal-msg').textContent = ""; document.getElementById('btn-cancel-search').style.display = 'none'; document.getElementById('btn-in-game-quit').style.display = 'block';
};

document.getElementById('btn-cancel-search').onclick = () => { socket.emit('cancelPlay'); gameWrapper.style.display = 'none'; mainMenu.style.display = 'flex'; updateProfile(); document.getElementById('btn-cancel-search').style.display = 'none'; document.getElementById('goal-msg').textContent = ""; };

document.getElementById('btn-in-game-quit').onclick = () => {
    if (!serverState) return;
    if (myRole === 'spectator') {
        socket.emit('leaveMatch'); clientState = null; serverState = null; myRole = null; activeEmojis = [];
        document.getElementById('game-wrapper').style.display = 'none'; document.getElementById('end-screen').style.display = 'none'; document.getElementById('btn-in-game-quit').style.display = 'none'; document.getElementById('main-menu').style.display = 'flex'; updateProfile(); return;
    }
    const isBot = serverState.isBotMatch; const isFriendly = serverState.isFriendly;
    let msg = "Вы уверены, что хотите выйти?\n\nВам будет засчитано ПОРАЖЕНИЕ и снято ЭЛО!";
    if (isBot) msg = "Вы уверены, что хотите прервать тренировку?"; if (isFriendly) msg = "Вы уверены, что хотите покинуть дружеский матч?";
    if (confirm(msg)) {
        socket.emit('leaveMatch'); clientState = null; serverState = null; myRole = null; activeEmojis = [];
        document.getElementById('game-wrapper').style.display = 'none'; document.getElementById('end-screen').style.display = 'none'; document.getElementById('btn-in-game-quit').style.display = 'none'; document.getElementById('main-menu').style.display = 'flex'; updateProfile();
    }
};

socket.on('showEndScreen', () => { document.getElementById('end-screen').style.display = 'flex'; document.getElementById('btn-in-game-quit').style.display = 'none'; });
socket.on('hideEndScreen', () => { document.getElementById('end-screen').style.display = 'none'; confetti = []; activeEmojis = []; });
socket.on('opponentLeft', () => { socket.emit('leaveMatch'); clientState = null; serverState = null; myRole = null; activeEmojis = []; document.getElementById('game-wrapper').style.display = 'none'; document.getElementById('end-screen').style.display = 'none'; document.getElementById('btn-in-game-quit').style.display = 'none'; document.getElementById('main-menu').style.display = 'flex'; updateProfile(); });
document.getElementById('btn-new-game').onclick = () => { socket.emit('leaveMatch'); clientState = null; serverState = null; myRole = null; confetti = []; activeEmojis = []; document.getElementById('end-screen').style.display = 'none'; document.getElementById('btn-in-game-quit').style.display = 'none'; document.getElementById('goal-msg').textContent = "Ищем друга..."; document.getElementById('btn-cancel-search').style.display = 'block'; socket.emit('play'); };
document.getElementById('btn-leave-match').onclick = () => { socket.emit('leaveMatch'); clientState = null; serverState = null; myRole = null; confetti = []; activeEmojis = []; document.getElementById('game-wrapper').style.display = 'none'; document.getElementById('end-screen').style.display = 'none'; document.getElementById('btn-in-game-quit').style.display = 'none'; document.getElementById('main-menu').style.display = 'flex'; updateProfile(); };
socket.on('forceReload', () => { window.location.reload(); });

document.getElementById('btn-leaderboard').onclick = () => {
    socket.emit('getLeaderboard', (res) => {
        if (res.success) {
            const list = document.getElementById('leaderboard-list'); list.innerHTML = '';
            res.leaderboard.forEach(user => {
                const li = document.createElement('li'); li.style.margin = "8px 0";
                const clanBadge = user.clan ? `<span style="color:#8338ec; font-size:14px;">[${user.clan}]</span>` : '';
                li.innerHTML = `<b>${user.name}</b> ${clanBadge} — ЭЛО: ${getLvlHtml(user.rating)} ${user.rating}`;
                list.appendChild(li);
            });
            document.getElementById('leaderboard-modal').style.display = 'flex';
        }
    });
};
document.getElementById('btn-close-lb').onclick = () => { document.getElementById('leaderboard-modal').style.display = 'none'; };

// ==========================================
// 🔥 ИГРОВОЙ ДВИЖОК И ЭКРАН VS
// ==========================================
const canvas = document.getElementById('gameCanvas'); const ctx = canvas.getContext('2d');
let serverState = null; let clientState = null; let myRole = null; let hitCooldown = 0; let wallCooldown = 0;

socket.on('role', role => { myRole = role; });

window.sendEmoji = function(emoji) { socket.emit('sendEmoji', emoji); };
socket.on('showEmoji', (data) => {
    playPop(); let startX = 400; let startY = 200;
    if (data.role === 'p1') { startX = 150; } else if (data.role === 'p2') { startX = 650; } else { startX = 400; startY = 50; }
    activeEmojis.push({ text: data.emoji, x: startX + (Math.random() * 40 - 20), y: startY + (Math.random() * 40 - 20), life: 1.0 });
});

// 🔥 ЛОГИКА VS ЭКРАНА
socket.on('showVsScreen', (data) => {
    const p1 = data.p1; const p2 = data.p2;
    
    document.getElementById('vs-p1-av').src = `/${p1.avatar || 'avatar1'}.png`;
    document.getElementById('vs-p1-title').innerText = p1.title ? `[${p1.title}]` : '';
    document.getElementById('vs-p1-name').innerText = p1.name;
    document.getElementById('vs-p1-elo').innerHTML = `ЭЛО: ${getLvlHtml(Math.round(p1.rating))} ${Math.round(p1.rating)}`;

    document.getElementById('vs-p2-av').src = `/${p2.avatar || 'avatar1'}.png`;
    document.getElementById('vs-p2-title').innerText = p2.title ? `[${p2.title}]` : '';
    document.getElementById('vs-p2-name').innerText = p2.name;
    document.getElementById('vs-p2-elo').innerHTML = `ЭЛО: ${getLvlHtml(Math.round(p2.rating))} ${Math.round(p2.rating)}`;

    const vsScreen = document.getElementById('vs-screen');
    vsScreen.style.display = 'flex';
    
    setTimeout(() => {
        document.getElementById('vs-p1').style.transform = 'translateX(0)';
        document.getElementById('vs-p2').style.transform = 'translateX(0)';
        document.getElementById('vs-logo').style.opacity = '1';
    }, 100);

    setTimeout(() => {
        document.getElementById('vs-p1').style.transform = 'translateX(-100vw)';
        document.getElementById('vs-p2').style.transform = 'translateX(100vw)';
        document.getElementById('vs-logo').style.opacity = '0';
        setTimeout(() => { vsScreen.style.display = 'none'; }, 500);
    }, 3000);
});

socket.on('goalNotify', data => {
    document.getElementById('goal-msg').textContent = data.msg; document.getElementById('goal-msg').style.color = data.color;
    if (data.msg) {
        const myName = nameInput.value; const msgStr = data.msg;
        if (msgStr.includes(myName) || msgStr.includes('ПОБЕДА НАД БОТОМ') || msgStr.includes('ДРУГ СБЕЖАЛ')) { playGoalWin(); } 
        else if (msgStr.includes('ГОЛ:') || msgStr.includes('ЧЕМПИОН:') || msgStr.includes('БОТ ПОБЕДИЛ') || msgStr.includes('ТЕХ. ПОБЕДА:')) { playGoalLose(); }
        canvas.classList.add('shake'); setTimeout(() => canvas.classList.remove('shake'), 400); spawnConfetti();
    }
});

socket.on('gameStateUpdate', s => {
    serverState = s; if (!clientState) clientState = JSON.parse(JSON.stringify(s));
    
    const renderPaws = (score, color) => {
        const pawSVG = `<svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M8.35,3C9.53,2.83 10.78,4.12 11.14,5.9C11.5,7.67 10.85,9.25 9.67,9.43C8.5,9.61 7.24,8.32 6.87,6.54C6.5,4.77 7.17,3.19 8.35,3 M15.5,3C16.69,3.19 17.35,4.77 17,6.54C16.62,8.32 15.37,9.61 14.19,9.43C13,9.25 12.35,7.67 12.71,5.9C13.08,4.12 14.33,2.83 15.5,3 M5.1,7.61C6.22,7.31 7.6,8.39 8.16,10.03C8.73,11.67 8.27,13.25 7.15,13.56C6.03,13.86 4.65,12.78 4.09,11.14C3.52,9.5 3.97,7.92 5.1,7.61 M18.77,7.61C19.9,7.92 20.35,9.5 19.78,11.14C19.22,12.78 17.84,13.86 16.71,13.56C15.59,13.25 15.14,11.67 15.71,10.03C16.27,8.39 17.65,7.31 18.77,7.61 M11.93,11.5C13.72,11.5 15.7,12.22 16.71,13.38C17.75,14.57 18.06,16.5 17.5,17.96C16.92,19.5 15.36,21 12,21C8.64,21 7.08,19.5 6.5,17.96C5.94,16.5 6.25,14.57 7.29,13.38C8.3,12.22 10.14,11.5 11.93,11.5Z" /></svg>`;
        let html = '';
        for (let i = 0; i < 5; i++) {
            if (i < score) html += `<div style="color: ${color}; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3)); transform: scale(1.1); transition: 0.2s;">${pawSVG}</div>`;
            else html += `<div style="color: #999; opacity: 0.3; transition: 0.2s;">${pawSVG}</div>`;
        }
        return html;
    };
    
    document.getElementById('s1').innerHTML = renderPaws(s.player1.score, '#4da6ff');
    document.getElementById('s2').innerHTML = renderPaws(s.player2.score, '#ff4d4d');
    document.getElementById('r1').innerHTML = `(ЭЛО: ${getLvlHtml(Math.round(s.player1.rating))} ${Math.round(s.player1.rating)})`;
    document.getElementById('r2').innerHTML = `(ЭЛО: ${getLvlHtml(Math.round(s.player2.rating))} ${Math.round(s.player2.rating)})`;
    document.getElementById('n1').textContent = s.player1.name;
    document.getElementById('n2').textContent = s.player2.name;
    
    if (s.timeLeft !== null && s.timeLeft !== undefined && !s.gameOver) {
        document.getElementById('goal-msg').textContent = `Ждем друга: ${s.timeLeft}с`;
        document.getElementById('goal-msg').style.color = "#ffb703";
    } else if (s.player1.id && s.player2.id && !s.gameOver && myRole !== 'spectator') {
        document.getElementById('btn-cancel-search').style.display = 'none';
        document.getElementById('btn-in-game-quit').style.display = 'block';
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
    if (!myRole || myRole === 'spectator' || !clientState || !serverState || serverState.paused || serverState.gameOver) return;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    
    const me = myRole === 'p1' ? 'player1' : 'player2';
    // 🔥 БАФЫ: Компот теперь большой, а Карамелька обычная
    let pR = serverState[me].skin === 'kompot' ? 43 : (serverState[me].skin === 'gonya' ? 28 : 35);
    
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
    // 🔥 БАФЫ
    let r = skinName === 'kompot' ? 43 : (skinName === 'gonya' ? 28 : 35);
    
    if (skinName && skinName !== 'default' && catImages[skinName] && catImages[skinName].complete && catImages[skinName].naturalWidth > 0) {
        ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(catImages[skinName], x - r, y - r, r * 2, r * 2); ctx.restore();
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.lineWidth = 5; ctx.strokeStyle = color; ctx.stroke();
    } else {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (skinName === 'korzhik') ctx.fillText("КОРЖ", x, y);
        else if (skinName === 'karamelka') ctx.fillText("КАРА", x, y);
        else if (skinName === 'kompot') ctx.fillText("КОМП", x, y);
        else if (skinName === 'gonya') ctx.fillText("ГОНЯ", x, y);
        else { ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
    }
}

function render(s) {
    ctx.fillStyle = '#f4faff'; ctx.fillRect(0, 0, 800, 400); ctx.font = '30px Arial'; ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    [{t:'🐾', x:120, y:80}, {t:'⭐', x:150, y:320}, {t:'🐾', x:280, y:200}, {t:'⭐', x:350, y:80}, {t:'🐾', x:400, y:320}, {t:'⭐', x:520, y:200}, {t:'🐾', x:680, y:80}, {t:'⭐', x:650, y:320}].forEach(d => ctx.fillText(d.t, d.x, d.y));
    
    ctx.lineWidth = 6; ctx.fillStyle = 'rgba(77, 166, 255, 0.2)'; ctx.beginPath(); ctx.arc(0, 200, 100, -Math.PI/2, Math.PI/2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 77, 77, 0.2)'; ctx.beginPath(); ctx.arc(800, 200, 100, Math.PI/2, -Math.PI/2); ctx.fill();
    ctx.strokeStyle = '#ff4d4d'; ctx.beginPath(); ctx.moveTo(400,0); ctx.lineTo(400,400); ctx.stroke();
    ctx.strokeStyle = '#4da6ff'; ctx.beginPath(); ctx.moveTo(250,0); ctx.lineTo(250,400); ctx.stroke(); ctx.beginPath(); ctx.moveTo(550,0); ctx.lineTo(550,400); ctx.stroke();
    ctx.strokeStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(400,200,80,0,Math.PI*2); ctx.stroke(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(400,200,77,0,Math.PI*2); ctx.fill();
    
    const rCat = 22;
    if (catImages['korzhik'].complete && catImages['korzhik'].naturalWidth > 0) ctx.drawImage(catImages['korzhik'], 400 - 45 - rCat, 200 - rCat, rCat*2, rCat*2);
    if (catImages['karamelka'].complete && catImages['karamelka'].naturalWidth > 0) ctx.drawImage(catImages['karamelka'], 400 - rCat, 200 - 35 - rCat, rCat*2, rCat*2);
    if (catImages['kompot'].complete && catImages['kompot'].naturalWidth > 0) ctx.drawImage(catImages['kompot'], 400 + 45 - rCat, 200 - rCat, rCat*2, rCat*2);
        
    ctx.lineWidth = 12; ctx.strokeStyle = '#4da6ff'; ctx.strokeRect(0, 115, 10, 170); ctx.strokeStyle = '#ff4d4d'; ctx.strokeRect(790, 115, 10, 170);

    let px = s.puck.x; let py = s.puck.y;
    
    if (myRole && myRole !== 'spectator' && !serverState.paused && !serverState.gameOver) {
        const myPlayer = myRole === 'p1' ? s.player1 : s.player2;
        let pR = serverState[myRole === 'p1' ? 'player1' : 'player2'].skin === 'kompot' ? 43 : (serverState[myRole === 'p1' ? 'player1' : 'player2'].skin === 'gonya' ? 28 : 35);
        let dx = px - myPlayer.x; let dy = py - myPlayer.y; let dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < pR + 22) { px = myPlayer.x + (dx/dist)*(pR+22); py = myPlayer.y + (dy/dist)*(pR+22); }
    }
    
    if (!serverState.paused && !serverState.gameOver) { puckTrail.push({x: px, y: py}); if(puckTrail.length > 10) puckTrail.shift(); } 
    else { puckTrail = []; }

    ctx.save();
    for (let i = 0; i < puckTrail.length; i++) { ctx.beginPath(); ctx.arc(puckTrail[i].x, puckTrail[i].y, 22 * (i/puckTrail.length), 0, Math.PI * 2); ctx.fillStyle = `rgba(130, 200, 255, ${0.4 * (i/puckTrail.length)})`; ctx.fill(); }
    ctx.restore();
    
    ctx.beginPath(); ctx.arc(px, py, 22, 0, Math.PI * 2); ctx.fillStyle = '#333'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#111'; ctx.stroke(); ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.fillStyle = '#666'; ctx.fill();

    drawPlayer(s.player1.x, s.player1.y, serverState.player1.skin, '#4da6ff');
    drawPlayer(s.player2.x, s.player2.y, serverState.player2.skin, '#ff4d4d');

    if (confetti.length > 0) {
        confetti.forEach((c, index) => { c.x += c.vx; c.y += c.vy; c.vy += 0.8; c.life -= 0.015; ctx.globalAlpha = Math.max(0, c.life); ctx.fillStyle = c.color; ctx.fillRect(c.x, c.y, c.size, c.size); if (c.life <= 0) confetti.splice(index, 1); }); ctx.globalAlpha = 1.0;
    }
    
    if (activeEmojis.length > 0) {
        activeEmojis.forEach((em, index) => { em.y -= 1.5; em.life -= 0.015; ctx.save(); ctx.globalAlpha = Math.max(0, em.life); ctx.font = '50px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 5; ctx.fillText(em.text, em.x, em.y); ctx.restore(); if (em.life <= 0) activeEmojis.splice(index, 1); });
    }
}

function loop() {
    if (serverState && clientState) {
        const lerp = 0.4;
        clientState.puck.x += (serverState.puck.x - clientState.puck.x) * lerp; clientState.puck.y += (serverState.puck.y - clientState.puck.y) * lerp;
        clientState.player1.x += (serverState.player1.x - clientState.player1.x) * lerp; clientState.player1.y += (serverState.player1.y - clientState.player1.y) * lerp;
        clientState.player2.x += (serverState.player2.x - clientState.player2.x) * lerp; clientState.player2.y += (serverState.player2.y - clientState.player2.y) * lerp;
        
        if (!serverState.paused && !serverState.gameOver) {
            if (hitCooldown > 0) hitCooldown--; if (wallCooldown > 0) wallCooldown--;
            if ((serverState.puck.y <= 26 || serverState.puck.y >= 374) && wallCooldown === 0) { playWall(); wallCooldown = 15; }

            const checkHit = (p) => {
                let r = serverState[p].skin === 'kompot' ? 43 : (serverState[p].skin === 'gonya' ? 28 : 35);
                let dx = clientState.puck.x - clientState[p].x; let dy = clientState.puck.y - clientState[p].y;
                if (Math.sqrt(dx*dx + dy*dy) < r + 22 + 4 && hitCooldown === 0) { playHit(); hitCooldown = 15; }
            };
            checkHit('player1'); checkHit('player2');
        }
        render(clientState);
    }
    requestAnimationFrame(loop);
}

loop();