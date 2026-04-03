const myBoardEl = document.getElementById('my-board');
const enemyBoardEl = document.getElementById('enemy-board');
const statusEl = document.getElementById('status');
const turnIndicator = document.getElementById('turn-indicator');
const gameZone = document.getElementById('game-zone');
const readyBtn = document.getElementById('ready-btn');

let peer = new Peer();
let conn = null;

// Игровые данные
let myGrid = Array(10).fill(null).map(() => Array(10).fill(0)); // 0-пусто, 1-корабль, 2-мина
let myShips =[]; // Хранит палубы кораблей для проверки уничтожения
let isMyTurn = false;
let amIReady = false;
let isEnemyReady = false;
let isHost = false; // Тот, к кому подключились, ходит вторым

// Способности
let skills = { radar: 1, airstrike: 1 };
let currentAction = 'shoot'; // 'shoot', 'radar', 'airstrike'

// --- 1. ИНИЦИАЛИЗАЦИЯ И СЕТЬ ---
peer.on('open', (id) => document.getElementById('my-id').innerText = id);

peer.on('connection', (connection) => {
    conn = connection;
    isHost = true;
    setupConnection();
});

document.getElementById('connect-btn').addEventListener('click', () => {
    const enemyId = document.getElementById('enemy-id').value;
    if(!enemyId) return;
    conn = peer.connect(enemyId);
    isHost = false;
    setupConnection();
});

function setupConnection() {
    conn.on('open', () => {
        document.getElementById('connection-panel').style.display = 'none';
        gameZone.style.display = 'block';
        initBoards();
        randomizeFleet(); // Авторасстановка
    });

    conn.on('data', handleNetworkData);
}

// --- 2. ГЕНЕРАЦИЯ ПОЛЕЙ И ФЛОТА ---
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

function randomizeFleet() {
    myGrid = Array(10).fill(null).map(() => Array(10).fill(0));
    myShips = [];
    
    const shipSizes =[4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
    shipSizes.forEach(size => placeShipRandomly(size));
    
    // Ставим 3 мины
    for(let i=0; i<3; i++) placeMineRandomly();
    drawMyBoard();
}

function placeShipRandomly(size) {
    let placed = false;
    while (!placed) {
        let x = Math.floor(Math.random() * 10);
        let y = Math.floor(Math.random() * 10);
        let isVertical = Math.random() > 0.5;

        if (canPlaceShip(x, y, size, isVertical)) {
            let shipCells =[];
            for (let i = 0; i < size; i++) {
                let cx = x + (isVertical ? 0 : i);
                let cy = y + (isVertical ? i : 0);
                myGrid[cy][cx] = 1;
                shipCells.push({x: cx, y: cy, hit: false});
            }
            myShips.push(shipCells);
            placed = true;
        }
    }
}

function canPlaceShip(x, y, size, isVertical) {
    if (isVertical && y + size > 10) return false;
    if (!isVertical && x + size > 10) return false;

    for (let i = -1; i <= size; i++) {
        for (let j = -1; j <= 1; j++) {
            let cx = x + (isVertical ? j : i);
            let cy = y + (isVertical ? i : j);
            if (cx >= 0 && cx < 10 && cy >= 0 && cy < 10 && myGrid[cy][cx] !== 0) {
                return false;
            }
        }
    }
    return true;
}

function placeMineRandomly() {
    let placed = false;
    while(!placed) {
        let x = Math.floor(Math.random() * 10);
        let y = Math.floor(Math.random() * 10);
        if (myGrid[y][x] === 0) {
            myGrid[y][x] = 2; // 2 = мина
            placed = true;
        }
    }
}

function drawMyBoard() {
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            let cell = myBoardEl.children[y * 10 + x];
            cell.className = 'cell'; // reset
            if (myGrid[y][x] === 1) cell.classList.add('ship');
            if (myGrid[y][x] === 2) cell.classList.add('mine');
        }
    }
}

// --- 3. ИГРОВАЯ ЛОГИКА ---
readyBtn.addEventListener('click', () => {
    amIReady = true;
    readyBtn.style.display = 'none';
    turnIndicator.innerText = "Ожидание противника...";
    conn.send({ type: 'READY' });
    checkStart();
});

function checkStart() {
    if (amIReady && isEnemyReady) {
        document.getElementById('skills-panel').style.display = 'flex';
        isMyTurn = !isHost; // Клиент ходит первым
        updateTurnUI();
    }
}

function updateTurnUI() {
    if (isMyTurn) {
        turnIndicator.innerText = "ТВОЙ ХОД! Атакуй!";
        turnIndicator.style.color = "#0be881";
        enemyBoardEl.classList.remove('disabled');
    } else {
        turnIndicator.innerText = "Ход противника...";
        turnIndicator.style.color = "#ff3f34";
        enemyBoardEl.classList.add('disabled');
    }
}

// --- 4. МЕХАНИКИ (ОБРАБОТКА КЛИКА) ---
function executeAction(x, y) {
    if (!isMyTurn) return;

    if (currentAction === 'shoot') {
        conn.send({ type: 'SHOOT', x, y });
        isMyTurn = false;
    } else if (currentAction === 'radar') {
        conn.send({ type: 'RADAR', x, y });
        skills.radar--;
        document.getElementById('skill-radar').disabled = true;
        isMyTurn = false;
    } else if (currentAction === 'airstrike') {
        conn.send({ type: 'AIRSTRIKE', x, y });
        skills.airstrike--;
        document.getElementById('skill-airstrike').disabled = true;
        isMyTurn = false;
    }
    
    resetAction();
    updateTurnUI();
}

// --- 5. СЕТЕВОЙ ПРОТОКОЛ (ОБЩЕНИЕ ИГРОКОВ) ---
function handleNetworkData(data) {
    if (data.type === 'READY') {
        isEnemyReady = true;
        checkStart();
    }
    
    // ВРАГ СТРЕЛЯЕТ В НАС
    else if (data.type === 'SHOOT') {
        let result = processIncomingAttack(data.x, data.y);
        conn.send({ type: 'REPLY_SHOOT', x: data.x, y: data.y, result });
        
        if (result.status !== 'mine') isMyTurn = true; // Если враг попал в мину, он теряет ход, и мы ходим снова!
        updateTurnUI();
        checkLose();
    }
    // ОТВЕТ НА НАШ ВЫСТРЕЛ
    else if (data.type === 'REPLY_SHOOT') {
        updateEnemyBoard(data.x, data.y, data.result);
        if (data.result.status === 'mine') {
            alert("💥 ТЫ ПОПАЛ НА МИНУ! Пропуск хода!");
            isMyTurn = false; // Теряем ход
        }
        updateTurnUI();
    }

    // ВРАГ ИСПОЛЬЗУЕТ РАДАР
    else if (data.type === 'RADAR') {
        let found = false;
        for(let dy=-1; dy<=1; dy++){
            for(let dx=-1; dx<=1; dx++){
                let nx = data.x + dx, ny = data.y + dy;
                if(nx>=0 && nx<10 && ny>=0 && ny<10 && myGrid[ny][nx] === 1) found = true;
            }
        }
        conn.send({ type: 'REPLY_RADAR', x: data.x, y: data.y, found });
        isMyTurn = true; updateTurnUI();
    }
    // ОТВЕТ НА НАШ РАДАР
    else if (data.type === 'REPLY_RADAR') {
        alert(data.found ? "📡 РАДАР: В этой зоне есть корабли!" : "📡 РАДАР: Зона чиста.");
        let cell = enemyBoardEl.children[data.y * 10 + data.x];
        cell.classList.add('radar-zone');
        setTimeout(() => cell.classList.remove('radar-zone'), 3000);
    }

    // ВРАГ ИСПОЛЬЗУЕТ АВИАУДАР
    else if (data.type === 'AIRSTRIKE') {
        let targets =[
            {x: data.x, y: data.y}, {x: data.x-1, y: data.y}, {x: data.x+1, y: data.y},
            {x: data.x, y: data.y-1}, {x: data.x, y: data.y+1}
        ];
        let results = targets.map(t => {
            if(t.x>=0 && t.x<10 && t.y>=0 && t.y<10) return {x: t.x, y: t.y, res: processIncomingAttack(t.x, t.y)};
            return null;
        }).filter(r => r !== null);
        
        conn.send({ type: 'REPLY_AIRSTRIKE', results });
        isMyTurn = true; updateTurnUI();
        checkLose();
    }
    // ОТВЕТ НА НАШ АВИАУДАР
    else if (data.type === 'REPLY_AIRSTRIKE') {
        data.results.forEach(r => updateEnemyBoard(r.x, r.y, r.res));
    }

    else if (data.type === 'WIN') {
        alert("🎉 ТЫ ПОБЕДИЛ! Флот врага уничтожен!");
        location.reload();
    }
}

// Вспомогательная логика обработки урона у себя
function processIncomingAttack(x, y) {
    let cell = myBoardEl.children[y * 10 + x];
    if (myGrid[y][x] === 1) { // Корабль
        myGrid[y][x] = -1; // Подбит
        cell.classList.add('hit');
        
        // Проверяем уничтожен ли весь корабль
        let sunkShip = null;
        myShips.forEach(ship => {
            let part = ship.find(p => p.x === x && p.y === y);
            if(part) part.hit = true;
            if(ship.every(p => p.hit)) sunkShip = ship; // Корабль потоплен
        });

        if (sunkShip) {
            sunkShip.forEach(p => myBoardEl.children[p.y * 10 + p.x].classList.add('sunk'));
            return { status: 'sunk', ship: sunkShip };
        }
        return { status: 'hit' };
    } 
    else if (myGrid[y][x] === 2) { // Мина
        myGrid[y][x] = -2; // Взорвана
        cell.innerHTML = '💥';
        return { status: 'mine' };
    }
    else {
        cell.classList.add('miss');
        return { status: 'miss' };
    }
}

// Визуализация стрельбы по врагу
function updateEnemyBoard(x, y, result) {
    let cell = enemyBoardEl.children[y * 10 + x];
    if (result.status === 'hit') {
        cell.classList.add('hit');
    } else if (result.status === 'sunk') {
        result.ship.forEach(p => enemyBoardEl.children[p.y * 10 + p.x].classList.add('sunk'));
    } else if (result.status === 'mine') {
        cell.innerHTML = '💥';
        cell.classList.add('mine');
    } else {
        cell.classList.add('miss');
    }
}

function checkLose() {
    let hasAlive = myShips.some(ship => ship.some(p => !p.hit));
    if (!hasAlive) {
        conn.send({ type: 'WIN' });
        setTimeout(() => { alert("💀 ТЫ ПРОИГРАЛ! Твой флот на дне."); location.reload(); }, 500);
    }
}

// --- 6. ИНТЕРФЕЙС КНОПОК СПОСОБНОСТЕЙ ---
document.getElementById('skill-radar').onclick = () => { currentAction = 'radar'; toggleCancelBtn(true); };
document.getElementById('skill-airstrike').onclick = () => { currentAction = 'airstrike'; toggleCancelBtn(true); };
document.getElementById('skill-cancel').onclick = resetAction;

function toggleCancelBtn(show) {
    document.getElementById('skill-cancel').style.display = show ? 'inline-block' : 'none';
    enemyBoardEl.style.borderColor = show ? '#ffd32a' : '#4bcffa';
}
function resetAction() {
    currentAction = 'shoot';
    toggleCancelBtn(false);
}
