const myBoardEl = document.getElementById('my-board');
const enemyBoardEl = document.getElementById('enemy-board');
const statusEl = document.getElementById('status');
const turnIndicator = document.getElementById('turn-indicator');
const setupInstruction = document.getElementById('setup-instruction');

let peer = new Peer();
let conn = null;

let gameState = 'DISCONNECTED'; 
let isMyTurn = false;
let isHost = false; 

// Никнеймы
let myNick = "Игрок";
let enemyNick = "Противник";

// Данные
let myGrid = Array(10).fill(null).map(() => Array(10).fill(0)); 
let myShipsObjects =[
    { id: 0, size: 4, x: -1, y: -1, isVert: false },
    { id: 1, size: 3, x: -1, y: -1, isVert: false }, { id: 2, size: 3, x: -1, y: -1, isVert: false },
    { id: 3, size: 2, x: -1, y: -1, isVert: false }, { id: 4, size: 2, x: -1, y: -1, isVert: false }, { id: 5, size: 2, x: -1, y: -1, isVert: false },
    { id: 6, size: 1, x: -1, y: -1, isVert: false }, { id: 7, size: 1, x: -1, y: -1, isVert: false }, { id: 8, size: 1, x: -1, y: -1, isVert: false }, { id: 9, size: 1, x: -1, y: -1, isVert: false }
];
let myMinesObjects =[ { id: 0, x: -1, y: -1 }, { id: 1, x: -1, y: -1 }, { id: 2, x: -1, y: -1 } ];

let myShips =[]; 
let skills = { radar: 1, airstrike: 1 };
let currentAction = 'shoot'; 

let selectedShip = null;
let selectedMine = null;
let isVerticalActive = false;

// ===================== 1. СЕТЬ И ЧАТ =====================
peer.on('open', id => {
    document.getElementById('my-id').innerText = id;
    statusEl.innerText = "Ожидание...";
});

peer.on('connection', connection => {
    conn = connection; isHost = true; setupConnection();
});

document.getElementById('connect-btn').addEventListener('click', () => {
    const enemyId = document.getElementById('enemy-id').value.trim();
    if(!enemyId) return alert("Введи ID друга!");
    statusEl.innerText = "Подключение...";
    conn = peer.connect(enemyId, { reliable: true });
    isHost = false; setupConnection();
});

function setupConnection() {
    conn.on('open', () => {
        // Установка никнейма
        let inputNick = document.getElementById('my-nick').value.trim();
        if (inputNick) myNick = inputNick;
        
        document.getElementById('connection-panel').style.display = 'none';
        document.getElementById('game-zone').style.display = 'flex';
        document.getElementById('game-zone').style.flexDirection = 'column';
        document.getElementById('game-zone').style.alignItems = 'center';
        document.getElementById('chat-panel').style.display = 'block';
        
        gameState = 'SETUP';
        
        // Отправляем свой ник врагу
        conn.send({ type: 'HELLO', nick: myNick });
        
        initBoards();
        randomizeFleet();
        appendChat('', 'Соединение установлено! Расставляйте флот.', 'system');
    });
    conn.on('data', handleNetworkData);
}

// Логика Чата
document.getElementById('chat-send').addEventListener('click', sendChat);
document.getElementById('chat-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') sendChat(); });

function sendChat() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    appendChat(myNick, text, 'self');
    conn.send({ type: 'CHAT', text: text });
    input.value = '';
}

function appendChat(sender, text, type) {
    const msgs = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-msg ' + type;
    div.innerText = type === 'system' ? text : `${sender}: ${text}`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight; // Автоскролл вниз
}

// ===================== 2. РАССТАНОВКА И ТАПЫ =====================
// (Весь блок расстановки и генерации такой же, как в прошлой версии)
function initBoards() {
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            const myCell = document.createElement('div'); myCell.className = 'cell'; myCell.dataset.x = x; myCell.dataset.y = y; myBoardEl.appendChild(myCell);
            const enemyCell = document.createElement('div'); enemyCell.className = 'cell'; enemyCell.dataset.x = x; enemyCell.dataset.y = y; enemyBoardEl.appendChild(enemyCell);
        }
    }
}
document.getElementById('random-btn').addEventListener('click', randomizeFleet);
document.getElementById('rotate-btn').addEventListener('click', () => {
    isVerticalActive = !isVerticalActive;
    document.getElementById('rotate-btn').innerText = isVerticalActive ? "🔄 Поворот: Верт." : "🔄 Поворот: Горизонт.";
    if (selectedShip) setupInstruction.innerText = `В руке: Корабль (${selectedShip.size}). Тапни куда поставить.`;
});

function randomizeFleet() {
    selectedShip = null; selectedMine = null;
    let success = false; let attemptsGlobal = 0;

    while (!success && attemptsGlobal < 50) {
        success = true; attemptsGlobal++;
        myShipsObjects.forEach(s => { s.x = -1; s.y = -1; });
        myMinesObjects.forEach(m => { m.x = -1; m.y = -1; });
        
        for (let ship of myShipsObjects) {
            let placed = false; let attempts = 0;
            while (!placed && attempts < 100) {
                let x = Math.floor(Math.random() * 10); let y = Math.floor(Math.random() * 10); let isVert = Math.random() > 0.5;
                updateGridArray();
                if (canPlaceShip(x, y, ship.size, isVert)) { ship.x = x; ship.y = y; ship.isVert = isVert; placed = true; }
                attempts++;
            }
            if (!placed) { success = false; break; }
        }
        if (!success) continue;
        for (let mine of myMinesObjects) {
            let placed = false; let attempts = 0;
            while(!placed && attempts < 100) {
                let x = Math.floor(Math.random() * 10); let y = Math.floor(Math.random() * 10);
                updateGridArray();
                if (myGrid[y][x] === 0) { mine.x = x; mine.y = y; placed = true; }
                attempts++;
            }
            if(!placed) { success = false; break; }
        }
    }
    updateGridArray(); drawMyBoard();
    setupInstruction.innerText = "Флот расставлен! Тапни на корабль, чтобы переместить.";
}

function updateGridArray() {
    myGrid = Array(10).fill(null).map(() => Array(10).fill(0));
    myShipsObjects.forEach(s => {
        if (s.x === -1) return;
        for(let i=0; i<s.size; i++) { let cx = s.x + (s.isVert ? 0 : i); let cy = s.y + (s.isVert ? i : 0); myGrid[cy][cx] = 1; }
    });
    myMinesObjects.forEach(m => { if (m.x !== -1) myGrid[m.y][m.x] = 2; });
}

function canPlaceShip(x, y, size, isVert) {
    if (isVert && y + size > 10) return false; if (!isVert && x + size > 10) return false;
    for (let i = -1; i <= size; i++) {
        for (let j = -1; j <= 1; j++) {
            let cx = x + (isVert ? j : i); let cy = y + (isVert ? i : j);
            if (cx >= 0 && cx < 10 && cy >= 0 && cy < 10 && myGrid[cy][cx] !== 0) return false;
        }
    }
    return true;
}

function drawMyBoard() {
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            let cell = myBoardEl.children[y * 10 + x]; cell.className = 'cell'; 
            if (myGrid[y][x] === 1) cell.classList.add('ship');
            if (myGrid[y][x] === 2) { cell.classList.add('mine'); cell.innerText = '💥'; } else { cell.innerText = ''; }
        }
    }
}

myBoardEl.addEventListener('click', (e) => {
    if (gameState !== 'SETUP') return;
    const cell = e.target.closest('.cell'); if (!cell) return;
    const x = parseInt(cell.dataset.x); const y = parseInt(cell.dataset.y);

    if (selectedShip) {
        updateGridArray();
        if (canPlaceShip(x, y, selectedShip.size, isVerticalActive)) {
            selectedShip.x = x; selectedShip.y = y; selectedShip.isVert = isVerticalActive; selectedShip = null;
            updateGridArray(); drawMyBoard(); setupInstruction.innerText = "Корабль поставлен!";
        } else { setupInstruction.innerText = "❌ Сюда ставить нельзя!"; }
    } else if (selectedMine) {
        updateGridArray();
        if (myGrid[y][x] === 0) {
            selectedMine.x = x; selectedMine.y = y; selectedMine = null;
            updateGridArray(); drawMyBoard(); setupInstruction.innerText = "Мина установлена!";
        } else { setupInstruction.innerText = "❌ Мину только в пустую клетку!"; }
    } else { 
        let clickedShip = myShipsObjects.find(s => s.x !== -1 && ((s.isVert && x === s.x && y >= s.y && y < s.y + s.size) || (!s.isVert && y === s.y && x >= s.x && x < s.x + s.size)));
        if (clickedShip) {
            selectedShip = clickedShip; clickedShip.x = -1; clickedShip.y = -1; updateGridArray(); drawMyBoard();
            setupInstruction.innerText = `В руке: Корабль (${clickedShip.size}). Тапни по полю.`; return;
        }
        let clickedMine = myMinesObjects.find(m => m.x === x && m.y === y);
        if (clickedMine) {
            selectedMine = clickedMine; clickedMine.x = -1; clickedMine.y = -1; updateGridArray(); drawMyBoard();
            setupInstruction.innerText = `В руке: Мина. Тапни по полю.`;
        }
    }
});

// ===================== 3. БОЙ И СТРЕЛЬБА =====================
let amIReady = false, isEnemyReady = false;

document.getElementById('ready-btn').addEventListener('click', () => {
    if (selectedShip || selectedMine) return alert("Сначала поставь предмет на поле!");
    myShips = myShipsObjects.map(s => {
        let cells =[];
        for(let i=0; i<s.size; i++) cells.push({ x: s.x + (s.isVert ? 0 : i), y: s.y + (s.isVert ? i : 0), hit: false });
        return cells;
    });

    amIReady = true;
    document.getElementById('setup-panel').style.display = 'none';
    document.getElementById('battle-panel').style.display = 'block';
    document.getElementById('enemy-wrapper').style.display = 'block'; 
    
    document.getElementById('my-board-title').innerText = "Твой флот (" + myNick + ")";
    myBoardEl.style.maxWidth = "200px"; // Уменьшаем наше поле на мобилке
    
    gameState = 'WAITING';
    conn.send({ type: 'READY' });
    appendChat('', 'Флот готов к бою!', 'system');
    checkStart();
});

function checkStart() {
    if (amIReady && isEnemyReady) {
        document.getElementById('skills-panel').style.display = 'flex';
        gameState = 'BATTLE'; isMyTurn = !isHost;
        appendChat('', 'Игра началась!', 'system');
        updateTurnUI();
    }
}

function updateTurnUI() {
    if (isMyTurn) {
        turnIndicator.innerText = "⚔️ ТВОЙ ХОД!";
        turnIndicator.style.color = "#0be881";
        enemyBoardEl.classList.remove('disabled');
    } else {
        turnIndicator.innerText = "⏳ Ход: " + enemyNick;
        turnIndicator.style.color = "#ff3f34";
        enemyBoardEl.classList.add('disabled');
    }
}

enemyBoardEl.addEventListener('click', (e) => {
    if (gameState !== 'BATTLE' || !isMyTurn) return;
    const cell = e.target.closest('.cell'); if (!cell) return;
    executeAction(parseInt(cell.dataset.x), parseInt(cell.dataset.y));
});

function executeAction(x, y) {
    if (currentAction === 'shoot') conn.send({ type: 'SHOOT', x, y });
    else if (currentAction === 'radar') { conn.send({ type: 'RADAR', x, y }); skills.radar--; document.getElementById('skill-radar').disabled = true; }
    else if (currentAction === 'airstrike') { conn.send({ type: 'AIRSTRIKE', x, y }); skills.airstrike--; document.getElementById('skill-airstrike').disabled = true; }
    
    // Временно блокируем клики, пока не придет ответ
    isMyTurn = false;
    currentAction = 'shoot'; document.getElementById('skill-cancel').style.display = 'none';
    enemyBoardEl.style.borderColor = '#4bcffa';
    updateTurnUI();
}

function handleNetworkData(data) {
    if (data.type === 'HELLO') {
        enemyNick = data.nick || "Противник";
        document.getElementById('enemy-board-title').innerText = "Территория: " + enemyNick;
    }
    else if (data.type === 'CHAT') {
        appendChat(enemyNick, data.text, 'enemy');
    }
    else if (data.type === 'READY') { 
        isEnemyReady = true; 
        appendChat('', enemyNick + ' расставил флот!', 'system');
        checkStart(); 
    }
    
    // ВРАГ АТАКОВАЛ НАС
    else if (data.type === 'SHOOT') {
        let result = processIncomingAttack(data.x, data.y);
        conn.send({ type: 'REPLY_SHOOT', x: data.x, y: data.y, result });
        
        // Исправленная логика передачи хода:
        // Если враг попал в корабль - он стреляет еще раз. Иначе ход переходит к нам.
        if (result.status === 'hit' || result.status === 'sunk') {
            isMyTurn = false;
        } else {
            isMyTurn = true; 
        }
        updateTurnUI(); 
        checkLose();
    }
    // ОТВЕТ НА НАШУ АТАКУ
    else if (data.type === 'REPLY_SHOOT') {
        updateEnemyBoard(data.x, data.y, data.result);
        
        if (data.result.status === 'hit' || data.result.status === 'sunk') {
            isMyTurn = true; // Мы попали - стреляем еще раз!
        } else {
            isMyTurn = false; // Промах или мина - ход уходит
        }

        // МЕХАНИКА МИНЫ: Если мы попали в мину, наш случайный корабль получает урон!
        if (data.result.status === 'mine') {
            alert(`💥 Внимание! Ты попал на мину игрока ${enemyNick}!\nОдин из твоих кораблей получил случайный урон, а ход переходит врагу.`);
            applyMinePenalty(); // Наносим себе урон
        }
        updateTurnUI();
    }
    // ВРАГ ПОЛУЧИЛ УРОН ОТ МИНЫ И ПРИСЛАЛ НАМ РЕЗУЛЬТАТ
    else if (data.type === 'MINE_SHRAPNEL') {
        updateEnemyBoard(data.x, data.y, data.result);
        appendChat('', enemyNick + ' подорвался на твоей мине!', 'system');
    }

    else if (data.type === 'RADAR') {
        let found = false;
        for(let dy=-1; dy<=1; dy++) for(let dx=-1; dx<=1; dx++) {
            let nx = data.x + dx, ny = data.y + dy;
            if(nx>=0 && nx<10 && ny>=0 && ny<10 && myGrid[ny][nx]===1) found = true;
        }
        conn.send({ type: 'REPLY_RADAR', x: data.x, y: data.y, found });
        isMyTurn = true; updateTurnUI(); // Радар забирает ход
    }
    else if (data.type === 'REPLY_RADAR') {
        alert(data.found ? "📡 РАДАР: В этой зоне ЕСТЬ корабли!" : "📡 РАДАР: Зона чиста.");
        let cell = enemyBoardEl.children[data.y * 10 + data.x];
        cell.classList.add('radar-zone'); setTimeout(() => cell.classList.remove('radar-zone'), 3000);
    }
    else if (data.type === 'AIRSTRIKE') {
        let targets =[{x: data.x, y: data.y}, {x: data.x-1, y: data.y}, {x: data.x+1, y: data.y}, {x: data.x, y: data.y-1}, {x: data.x, y: data.y+1}];
        let results = targets.map(t => (t.x>=0 && t.x<10 && t.y>=0 && t.y<10) ? {x: t.x, y: t.y, res: processIncomingAttack(t.x, t.y)} : null).filter(r => r !== null);
        conn.send({ type: 'REPLY_AIRSTRIKE', results });
        isMyTurn = true; updateTurnUI(); checkLose();
    }
    else if (data.type === 'REPLY_AIRSTRIKE') { data.results.forEach(r => updateEnemyBoard(r.x, r.y, r.res)); }
    
    else if (data.type === 'WIN') { 
        alert("🎉 ПОБЕДА! " + enemyNick + " разбит!"); 
        location.reload(); 
    }
}

// Новая функция для урона самому себе при взрыве на мине
function applyMinePenalty() {
    let aliveCells =[];
    myShips.forEach(ship => {
        ship.forEach(p => { if (!p.hit) aliveCells.push({ x: p.x, y: p.y }); });
    });
    
    if (aliveCells.length > 0) {
        // Выбираем случайную целую палубу
        let target = aliveCells[Math.floor(Math.random() * aliveCells.length)];
        let res = processIncomingAttack(target.x, target.y);
        
        // Отправляем врагу инфу, чтобы он видел на своем экране, как наш корабль загорелся
        conn.send({ type: 'MINE_SHRAPNEL', x: target.x, y: target.y, result: res });
        checkLose();
    }
}

function processIncomingAttack(x, y) {
    let cell = myBoardEl.children[y * 10 + x];
    if (myGrid[y][x] === 1) { 
        myGrid[y][x] = -1; cell.classList.add('hit'); cell.innerText = '🔥';
        let sunkShip = null;
        myShips.forEach(ship => {
            let part = ship.find(p => p.x === x && p.y === y);
            if(part) part.hit = true;
            if(ship.every(p => p.hit)) sunkShip = ship;
        });
        if (sunkShip) { sunkShip.forEach(p => { myBoardEl.children[p.y * 10 + p.x].classList.add('sunk'); myBoardEl.children[p.y * 10 + p.x].innerText = '💀'; }); return { status: 'sunk', ship: sunkShip }; }
        return { status: 'hit' };
    } 
    else if (myGrid[y][x] === 2) { myGrid[y][x] = -2; cell.innerText = '💥'; return { status: 'mine' }; }
    else { cell.classList.add('miss'); cell.innerText = '💧'; return { status: 'miss' }; }
}

function updateEnemyBoard(x, y, result) {
    let cell = enemyBoardEl.children[y * 10 + x];
    if (result.status === 'hit') { cell.classList.add('hit'); cell.innerText = '🔥'; } 
    else if (result.status === 'sunk') { result.ship.forEach(p => { let c = enemyBoardEl.children[p.y * 10 + p.x]; c.classList.add('sunk'); c.innerText = '💀'; }); } 
    else if (result.status === 'mine') { cell.innerText = '💥'; cell.classList.add('mine'); } 
    else { cell.classList.add('miss'); cell.innerText = '💧'; }
}

function checkLose() {
    if (!myShips.some(ship => ship.some(p => !p.hit))) { conn.send({ type: 'WIN' }); setTimeout(() => { alert("💀 ПОРАЖЕНИЕ! Твой флот на дне."); location.reload(); }, 500); }
}

document.getElementById('skill-radar').onclick = () => { currentAction = 'radar'; enemyBoardEl.style.borderColor = '#ffd32a'; document.getElementById('skill-cancel').style.display = 'inline-block'; };
document.getElementById('skill-airstrike').onclick = () => { currentAction = 'airstrike'; enemyBoardEl.style.borderColor = '#ffd32a'; document.getElementById('skill-cancel').style.display = 'inline-block'; };
document.getElementById('skill-cancel').onclick = () => { currentAction = 'shoot'; enemyBoardEl.style.borderColor = '#4bcffa'; document.getElementById('skill-cancel').style.display = 'none'; };
