const myBoardEl = document.getElementById('my-board');
const enemyBoardEl = document.getElementById('enemy-board');
const statusEl = document.getElementById('status');
const turnIndicator = document.getElementById('turn-indicator');
const gameZone = document.getElementById('game-zone');
const setupPanel = document.getElementById('setup-panel');
const battlePanel = document.getElementById('battle-panel');
const setupInstruction = document.getElementById('setup-instruction');

let peer = new Peer();
let conn = null;

// Состояния игры
let gameState = 'DISCONNECTED'; // SETUP, WAITING, BATTLE
let isMyTurn = false;
let isHost = false; 

// ДАННЫЕ ФЛОТА (Объекты для ручной расстановки)
let myGrid = Array(10).fill(null).map(() => Array(10).fill(0)); 
let myShipsObjects =[
    { id: 0, size: 4, x: -1, y: -1, isVert: false },
    { id: 1, size: 3, x: -1, y: -1, isVert: false }, { id: 2, size: 3, x: -1, y: -1, isVert: false },
    { id: 3, size: 2, x: -1, y: -1, isVert: false }, { id: 4, size: 2, x: -1, y: -1, isVert: false }, { id: 5, size: 2, x: -1, y: -1, isVert: false },
    { id: 6, size: 1, x: -1, y: -1, isVert: false }, { id: 7, size: 1, x: -1, y: -1, isVert: false }, { id: 8, size: 1, x: -1, y: -1, isVert: false }, { id: 9, size: 1, x: -1, y: -1, isVert: false }
];
let myMinesObjects =[ { id: 0, x: -1, y: -1 }, { id: 1, x: -1, y: -1 }, { id: 2, x: -1, y: -1 } ];

let myShips =[]; // Финальный массив для боя
let skills = { radar: 1, airstrike: 1 };
let currentAction = 'shoot'; 

// ==========================================
// 1. СЕТЬ
// ==========================================
peer.on('open', (id) => {
    document.getElementById('my-id').innerText = id;
    statusEl.innerText = "Ожидание подключения...";
});

peer.on('error', (err) => alert("Ошибка PeerJS: " + err.type));

peer.on('connection', (connection) => {
    conn = connection;
    isHost = true;
    setupConnection();
});

document.getElementById('connect-btn').addEventListener('click', () => {
    const enemyId = document.getElementById('enemy-id').value.trim();
    if(!enemyId) return alert("Введи ID друга!");
    statusEl.innerText = "Установка связи...";
    conn = peer.connect(enemyId, { reliable: true });
    isHost = false;
    setupConnection();
});

function setupConnection() {
    conn.on('open', () => {
        document.getElementById('connection-panel').style.display = 'none';
        gameZone.style.display = 'block';
        setupPanel.style.display = 'block';
        gameState = 'SETUP';
        
        initBoards();
        randomizeFleet(); // Генерируем первую случайную базу
    });
    conn.on('data', handleNetworkData);
}

// ==========================================
// 2. РАССТАНОВКА (РУЧНАЯ И АВТОМАТИЧЕСКАЯ)
// ==========================================
let selectedShip = null;
let selectedMine = null;
let isVerticalActive = false;

function initBoards() {
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            const myCell = document.createElement('div');
            myCell.className = 'cell'; myCell.dataset.x = x; myCell.dataset.y = y;
            myBoardEl.appendChild(myCell);

            const enemyCell = document.createElement('div');
            enemyCell.className = 'cell'; enemyCell.dataset.x = x; enemyCell.dataset.y = y;
            enemyCell.addEventListener('click', () => executeAction(x, y));
            enemyBoardEl.appendChild(enemyCell);
        }
    }
}

// Перемешивание
document.getElementById('random-btn').addEventListener('click', randomizeFleet);

// Поворот
document.getElementById('rotate-btn').addEventListener('click', () => {
    isVerticalActive = !isVerticalActive;
    document.getElementById('rotate-btn').innerText = isVerticalActive ? "🔄 Поворот: Вертикаль" : "🔄 Поворот: Горизонт.";
});

function randomizeFleet() {
    myShipsObjects.forEach(s => { s.x = -1; s.y = -1; });
    myMinesObjects.forEach(m => { m.x = -1; m.y = -1; });
    selectedShip = null; selectedMine = null;

    myShipsObjects.forEach(ship => {
        let placed = false;
        while(!placed) {
            let x = Math.floor(Math.random() * 10);
            let y = Math.floor(Math.random() * 10);
            let isVert = Math.random() > 0.5;
            updateGridArray();
            if (canPlaceShip(x, y, ship.size, isVert)) {
                ship.x = x; ship.y = y; ship.isVert = isVert;
                placed = true;
            }
        }
    });

    myMinesObjects.forEach(mine => {
        let placed = false;
        while(!placed) {
            let x = Math.floor(Math.random() * 10);
            let y = Math.floor(Math.random() * 10);
            updateGridArray();
            if (myGrid[y][x] === 0) { mine.x = x; mine.y = y; placed = true; }
        }
    });

    updateGridArray(); drawMyBoard();
    setupInstruction.innerText = "Нажми на любой корабль, чтобы передвинуть его вручную";
}

function updateGridArray() {
    myGrid = Array(10).fill(null).map(() => Array(10).fill(0));
    myShipsObjects.forEach(s => {
        if (s.x === -1) return;
        for(let i=0; i<s.size; i++) {
            let cx = s.x + (s.isVert ? 0 : i);
            let cy = s.y + (s.isVert ? i : 0);
            myGrid[cy][cx] = 1;
        }
    });
    myMinesObjects.forEach(m => { if (m.x !== -1) myGrid[m.y][m.x] = 2; });
}

function canPlaceShip(x, y, size, isVert) {
    if (isVert && y + size > 10) return false;
    if (!isVert && x + size > 10) return false;
    for (let i = -1; i <= size; i++) {
        for (let j = -1; j <= 1; j++) {
            let cx = x + (isVert ? j : i);
            let cy = y + (isVert ? i : j);
            if (cx >= 0 && cx < 10 && cy >= 0 && cy < 10 && myGrid[cy][cx] !== 0) return false;
        }
    }
    return true;
}

function drawMyBoard() {
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            let cell = myBoardEl.children[y * 10 + x];
            cell.className = 'cell'; 
            if (myGrid[y][x] === 1) cell.classList.add('ship');
            if (myGrid[y][x] === 2) cell.classList.add('mine');
        }
    }
}

// Ручное перемещение кликом
myBoardEl.addEventListener('click', (e) => {
    if (gameState !== 'SETUP') return;
    const cell = e.target;
    if (!cell.classList.contains('cell')) return;
    const x = parseInt(cell.dataset.x); const y = parseInt(cell.dataset.y);

    if (selectedShip) { // Установка корабля
        updateGridArray();
        if (canPlaceShip(x, y, selectedShip.size, isVerticalActive)) {
            selectedShip.x = x; selectedShip.y = y; selectedShip.isVert = isVerticalActive;
            selectedShip = null;
            updateGridArray(); drawMyBoard();
            setupInstruction.innerText = "Корабль поставлен! Можешь двигать другие.";
        } else {
            setupInstruction.innerText = "❌ Сюда ставить нельзя! Выбери другое место.";
        }
    } else if (selectedMine) { // Установка мины
        updateGridArray();
        if (myGrid[y][x] === 0) {
            selectedMine.x = x; selectedMine.y = y;
            selectedMine = null;
            updateGridArray(); drawMyBoard();
            setupInstruction.innerText = "Мина установлена!";
        }
    } else { // Взятие предмета
        let clickedShip = myShipsObjects.find(s => 
            s.x !== -1 && ((s.isVert && x === s.x && y >= s.y && y < s.y + s.size) || 
            (!s.isVert && y === s.y && x >= s.x && x < s.x + s.size))
        );
        if (clickedShip) {
            selectedShip = clickedShip;
            clickedShip.x = -1; clickedShip.y = -1; // Убираем с поля
            updateGridArray(); drawMyBoard();
            setupInstruction.innerText = `Взят корабль (${clickedShip.size} палуб). Кликни на пустую клетку.`;
            return;
        }
        let clickedMine = myMinesObjects.find(m => m.x === x && m.y === y);
        if (clickedMine) {
            selectedMine = clickedMine;
            clickedMine.x = -1; clickedMine.y = -1;
            updateGridArray(); drawMyBoard();
            setupInstruction.innerText = `Взята мина! Кликни на пустую клетку.`;
        }
    }
});


// ==========================================
// 3. ПОДТВЕРЖДЕНИЕ И НАЧАЛО БОЯ
// ==========================================
let amIReady = false, isEnemyReady = false;

document.getElementById('ready-btn').addEventListener('click', () => {
    if (selectedShip || selectedMine) {
        return alert("Ты не поставил взятый предмет на поле!");
    }
    
    // Переводим корабли в формат для боя
    myShips = myShipsObjects.map(s => {
        let cells =[];
        for(let i=0; i<s.size; i++) {
            cells.push({ x: s.x + (s.isVert ? 0 : i), y: s.y + (s.isVert ? i : 0), hit: false });
        }
        return cells;
    });

    amIReady = true;
    setupPanel.style.display = 'none';
    battlePanel.style.display = 'block';
    gameState = 'WAITING';
    
    conn.send({ type: 'READY' });
    checkStart();
});

function checkStart() {
    if (amIReady && isEnemyReady) {
        document.getElementById('skills-panel').style.display = 'flex';
        gameState = 'BATTLE';
        isMyTurn = !isHost; // Гость ходит первым
        updateTurnUI();
    }
}

function updateTurnUI() {
    if (isMyTurn) {
        turnIndicator.innerText = "⚔️ ТВОЙ ХОД! Атакуй!";
        turnIndicator.style.color = "#0be881";
        enemyBoardEl.classList.remove('disabled');
    } else {
        turnIndicator.innerText = "⏳ Ход противника...";
        turnIndicator.style.color = "#ff3f34";
        enemyBoardEl.classList.add('disabled');
    }
}

// ==========================================
// 4. БОЕВАЯ ЛОГИКА
// ==========================================
function executeAction(x, y) {
    if (gameState !== 'BATTLE' || !isMyTurn) return;

    if (currentAction === 'shoot') {
        conn.send({ type: 'SHOOT', x, y });
    } else if (currentAction === 'radar') {
        conn.send({ type: 'RADAR', x, y });
        skills.radar--; document.getElementById('skill-radar').disabled = true;
    } else if (currentAction === 'airstrike') {
        conn.send({ type: 'AIRSTRIKE', x, y });
        skills.airstrike--; document.getElementById('skill-airstrike').disabled = true;
    }
    
    isMyTurn = false;
    currentAction = 'shoot'; document.getElementById('skill-cancel').style.display = 'none';
    enemyBoardEl.style.borderColor = '#4bcffa';
    updateTurnUI();
}

function handleNetworkData(data) {
    if (data.type === 'READY') {
        isEnemyReady = true; checkStart();
    }
    else if (data.type === 'SHOOT') {
        let result = processIncomingAttack(data.x, data.y);
        conn.send({ type: 'REPLY_SHOOT', x: data.x, y: data.y, result });
        if (result.status !== 'mine') isMyTurn = true; 
        updateTurnUI(); checkLose();
    }
    else if (data.type === 'REPLY_SHOOT') {
        updateEnemyBoard(data.x, data.y, data.result);
        if (data.result.status === 'mine') {
            alert("💥 ТЫ ПОПАЛ НА МИНУ! Пропуск хода!");
            isMyTurn = false;
        }
        updateTurnUI();
    }
    // ...РАДАР И АВИАУДАР...
    else if (data.type === 'RADAR') {
        let found = false;
        for(let dy = -1; dy <= 1; dy++) {
            for(let dx = -1; dx <= 1; dx++) {
                let nx = data.x + dx, ny = data.y + dy;
                if(nx>=0 && nx<10 && ny>=0 && ny<10 && myGrid[ny][nx]===1) found = true;
            }
        }
        conn.send({ type: 'REPLY_RADAR', x: data.x, y: data.y, found });
        isMyTurn = true; updateTurnUI();
    }
    else if (data.type === 'REPLY_RADAR') {
        alert(data.found ? "📡 РАДАР: В этой зоне есть корабли!" : "📡 РАДАР: Зона чиста.");
        let cell = enemyBoardEl.children[data.y * 10 + data.x];
        cell.classList.add('radar-zone');
        setTimeout(() => cell.classList.remove('radar-zone'), 3000);
    }
    else if (data.type === 'AIRSTRIKE') {
        let targets =[{x: data.x, y: data.y}, {x: data.x-1, y: data.y}, {x: data.x+1, y: data.y}, {x: data.x, y: data.y-1}, {x: data.x, y: data.y+1}];
        let results = targets.map(t => {
            if(t.x>=0 && t.x<10 && t.y>=0 && t.y<10) return {x: t.x, y: t.y, res: processIncomingAttack(t.x, t.y)};
            return null;
        }).filter(r => r !== null);
        conn.send({ type: 'REPLY_AIRSTRIKE', results });
        isMyTurn = true; updateTurnUI(); checkLose();
    }
    else if (data.type === 'REPLY_AIRSTRIKE') {
        data.results.forEach(r => updateEnemyBoard(r.x, r.y, r.res));
    }
    else if (data.type === 'WIN') {
        alert("🎉 ТЫ ПОБЕДИЛ! Флот врага уничтожен!");
        location.reload();
    }
}

function processIncomingAttack(x, y) {
    let cell = myBoardEl.children[y * 10 + x];
    if (myGrid[y][x] === 1) { 
        myGrid[y][x] = -1; cell.classList.add('hit');
        let sunkShip = null;
        myShips.forEach(ship => {
            let part = ship.find(p => p.x === x && p.y === y);
            if(part) part.hit = true;
            if(ship.every(p => p.hit)) sunkShip = ship;
        });
        if (sunkShip) {
            sunkShip.forEach(p => myBoardEl.children[p.y * 10 + p.x].classList.add('sunk'));
            return { status: 'sunk', ship: sunkShip };
        }
        return { status: 'hit' };
    } 
    else if (myGrid[y][x] === 2) { 
        myGrid[y][x] = -2; cell.innerHTML = '💥'; return { status: 'mine' };
    }
    else { 
        cell.classList.add('miss'); return { status: 'miss' };
    }
}

function updateEnemyBoard(x, y, result) {
    let cell = enemyBoardEl.children[y * 10 + x];
    if (result.status === 'hit') { cell.classList.add('hit'); } 
    else if (result.status === 'sunk') { result.ship.forEach(p => enemyBoardEl.children[p.y * 10 + p.x].classList.add('sunk')); } 
    else if (result.status === 'mine') { cell.innerHTML = '💥'; cell.classList.add('mine'); } 
    else { cell.classList.add('miss'); }
}

function checkLose() {
    if (!myShips.some(ship => ship.some(p => !p.hit))) {
        conn.send({ type: 'WIN' });
        setTimeout(() => { alert("💀 ТЫ ПРОИГРАЛ! Твой флот на дне."); location.reload(); }, 500);
    }
}

// Кнопки скиллов
document.getElementById('skill-radar').onclick = () => { currentAction = 'radar'; enemyBoardEl.style.borderColor = '#ffd32a'; document.getElementById('skill-cancel').style.display = 'inline-block'; };
document.getElementById('skill-airstrike').onclick = () => { currentAction = 'airstrike'; enemyBoardEl.style.borderColor = '#ffd32a'; document.getElementById('skill-cancel').style.display = 'inline-block'; };
document.getElementById('skill-cancel').onclick = () => { currentAction = 'shoot'; enemyBoardEl.style.borderColor = '#4bcffa'; document.getElementById('skill-cancel').style.display = 'none'; };
