const myBoardEl = document.getElementById('my-board');
const enemyBoardEl = document.getElementById('enemy-board');
const statusEl = document.getElementById('status');
const gameZone = document.getElementById('game-zone');

let peer = new Peer(); // Создаем P2P узел
let conn = null; // Соединение с другом

// 1. Создаем сетки 10x10
function createBoard(element, isEnemy) {
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.x = x;
            cell.dataset.y = y;
            
            if (isEnemy) {
                cell.addEventListener('click', () => handleShoot(x, y));
            }
            element.appendChild(cell);
        }
    }
}
createBoard(myBoardEl, false);
createBoard(enemyBoardEl, true);

// 2. Инициализация сети
peer.on('open', (id) => {
    document.getElementById('my-id').innerText = id;
});

// Отлавливаем ошибки сети (очень важно!)
peer.on('error', (err) => {
    console.error(err);
    alert("Ошибка сети: " + err.type);
    statusEl.innerText = "Статус: Ошибка. Обновите страницу.";
});

// Если к нам подключаются
peer.on('connection', (connection) => {
    conn = connection;
    setupConnection();
});

// Если мы подключаемся к другу
document.getElementById('connect-btn').addEventListener('click', () => {
    const enemyId = document.getElementById('enemy-id').value.trim();
    
    // Проверка: ввел ли игрок ID
    if (!enemyId) {
        alert("Пожалуйста, введи ID друга!");
        return;
    }

    // Проверка: не пытается ли игрок подключиться сам к себе
    if (enemyId === peer.id) {
        alert("Нельзя подключиться к самому себе!");
        return;
    }

    statusEl.innerText = "Статус: Подключение...";
    
    conn = peer.connect(enemyId);
    setupConnection();
});

function setupConnection() {
    conn.on('open', () => {
        statusEl.innerText = "Статус: Игра началась!";
        document.getElementById('connection-panel').style.display = 'none';
        gameZone.style.display = 'block';
    });

    // Обработка входящих данных
    conn.on('data', (data) => {
        if (data.type === 'SHOOT') {
            console.log(`Противник выстрелил в ${data.x}, ${data.y}`);
            const cell = document.querySelector(`#my-board .cell[data-x="${data.x}"][data-y="${data.y}"]`);
            if(cell) cell.classList.add('miss'); // Пока всё мимо
        }
    });

    // Если противник отключился
    conn.on('close', () => {
        alert("Противник отключился!");
        location.reload();
    });
}

// 3. Механика стрельбы
function handleShoot(x, y) {
    if (!conn || !conn.open) {
        return alert("Соединение еще не установлено!");
    }
    
    // Визуализируем выстрел у себя на экране
    const cell = document.querySelector(`#enemy-board .cell[data-x="${x}"][data-y="${y}"]`);
    cell.style.transform = "scale(0.8)";
    setTimeout(() => cell.style.transform = "scale(1)", 150);

    // Отправляем выстрел другу по сети
    conn.send({ type: 'SHOOT', x: x, y: y });
}
