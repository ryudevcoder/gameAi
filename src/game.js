const config = {
    type: Phaser.AUTO,
    width: 900,
    height: 600,
    parent: 'game-container',
    backgroundColor: '#3d994d',
    physics: {
        default: 'arcade',
        arcade: { debug: false }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

let enemies;
let towers;
let bullets;
let path;
let graphics;
let currency = 100;
let lives = 20;
let wave = 1;
let selectedTowerType = null;
let waveActive = false;
let nextEnemyTime = 0;
let enemiesRemainingInWave = 0;
let previewTower;

const TOWER_DATA = {
    robust: { cost: 50, color: 0x3498db, range: 150, fireRate: 800, damage: 10, bulletSpeed: 400 },
    genius: { cost: 75, color: 0x9b59b6, range: 120, fireRate: 1200, damage: 2, bulletSpeed: 300, slow: 0.5 },
    ette: { cost: 120, color: 0xf1c40f, range: 250, fireRate: 2000, damage: 30, bulletSpeed: 600 }
};

function preload() {
    // We use graphics for placeholders as requested
}

function create() {
    // Define Path (Z-shape)
    path = new Phaser.Curves.Path(0, 150);
    path.lineTo(700, 150);
    path.lineTo(700, 450);
    path.lineTo(0, 450);

    // Draw Path
    graphics = this.add.graphics();
    graphics.lineStyle(40, 0x8b4513, 0.5);
    path.draw(graphics);

    enemies = this.physics.add.group();
    towers = this.add.group();
    bullets = this.physics.add.group();

    // UI Buttons
    document.getElementById('btn-robust').onclick = (e) => { e.stopPropagation(); selectTower('robust'); };
    document.getElementById('btn-genius').onclick = (e) => { e.stopPropagation(); selectTower('genius'); };
    document.getElementById('btn-ette').onclick = (e) => { e.stopPropagation(); selectTower('ette'); };

    this.input.on('pointerdown', (pointer) => {
        // Se clicar no mapa (gramado) e tiver algo selecionado
        if (selectedTowerType) {
            if (currency >= TOWER_DATA[selectedTowerType].cost) {
                if (!isPointOnPath(pointer.x, pointer.y)) {
                    placeTower(this, pointer.x, pointer.y);
                } else {
                    // Feedback visual se clicar no caminho
                    this.cameras.main.shake(100, 0.005);
                }
            }
        } else {
            // Se clicar no gramado sem nada selecionado, esconde todos os ranges abertos
            towers.getChildren().forEach(t => t.rangeCircle.visible = false);
        }
    });

    // Preview tower initialization
    previewTower = this.add.container(0, 0).setVisible(false).setDepth(100);
    const previewCircle = this.add.circle(0, 0, 20, 0xffffff, 0.5);
    const previewRange = this.add.circle(0, 0, 0, 0xffffff, 0.2);
    previewRange.setStrokeStyle(1, 0xffffff, 0.8);
    previewTower.add([previewRange, previewCircle]);
    previewTower.rangeCircle = previewRange;
    previewTower.mainCircle = previewCircle;

    // Start Wave Timer or trigger manually
    this.time.addEvent({
        delay: 3000,
        callback: startNewWave,
        callbackScope: this,
        loop: false
    });

    // Bullet vs Enemy Collision
    this.physics.add.overlap(bullets, enemies, (bullet, enemy) => {
        enemy.health -= bullet.damage;
        if (bullet.slow) {
            enemy.speedModifier = bullet.slow;
            this.time.delayedCall(1000, () => { if (enemy.active) enemy.speedModifier = 1; });
        }
        bullet.destroy();

        if (enemy.health <= 0) {
            enemy.destroy();
            updateCurrency(10);
        }
    });

    updateUI();
}

function update(time, delta) {
    if (waveActive && enemiesRemainingInWave > 0 && time > nextEnemyTime) {
        spawnEnemy(this);
        enemiesRemainingInWave--;
        nextEnemyTime = time + 1500 / (1 + (wave * 0.1));
    }

    if (waveActive && enemies.countActive() === 0 && enemiesRemainingInWave === 0) {
        waveActive = false;
        wave++;
        setTimeout(startNewWave, 4000);
        updateUI();
    }

    // Towers AI
    towers.getChildren().forEach(tower => {
        const target = getClosestEnemy(tower);
        if (target && time > tower.nextShot) {
            shoot(this, tower, target);
            tower.nextShot = time + tower.fireRate;
        }
    });

    // Enemy movement (Normalized with delta)
    enemies.getChildren().forEach(enemy => {
        const baseSpeed = 0.00003;
        enemy.t += (baseSpeed * delta * enemy.speed * enemy.speedModifier);

        const pos = path.getPoint(enemy.t);
        if (pos) {
            enemy.setPosition(pos.x, pos.y);
        }
        if (enemy.t >= 1) {
            lives--;
            enemy.destroy();
            updateUI();
            if (lives <= 0) gameOver();
        }
    });

    // Update preview tower position
    if (selectedTowerType) {
        previewTower.setVisible(true);
        previewTower.setPosition(this.input.x, this.input.y);
        const data = TOWER_DATA[selectedTowerType];
        previewTower.rangeCircle.setRadius(data.range);
        previewTower.mainCircle.setFillStyle(data.color, 0.5);

        // Feedback se está no caminho
        if (isPointOnPath(this.input.x, this.input.y)) {
            previewTower.mainCircle.setFillStyle(0xff0000, 0.5);
        }
    } else {
        previewTower.setVisible(false);
    }
}

function isPointOnPath(x, y) {
    const pathWidth = 50; // Um pouco maior que a linha do caminho (40)
    // Segmento 1: Horizontal (0, 150) -> (700, 150)
    if (x >= 0 && x <= 720 && Math.abs(y - 150) < pathWidth) return true;
    // Segmento 2: Vertical (700, 150) -> (700, 450)
    if (Math.abs(x - 700) < pathWidth && y >= 130 && y <= 470) return true;
    // Segmento 3: Horizontal (700, 450) -> (0, 450)
    if (x >= 0 && x <= 720 && Math.abs(y - 450) < pathWidth) return true;
    return false;
}

function startNewWave() {
    waveActive = true;
    enemiesRemainingInWave = 5 + (wave * 2);
    nextEnemyTime = 0;
}

function spawnEnemy(scene) {
    const isBoss = wave % 10 === 0 && enemiesRemainingInWave === 1;
    const isGato = !isBoss;

    const hpBase = isBoss ? 200 : 20;
    const health = hpBase * Math.pow(1.2, wave - 1);

    const enemy = scene.add.circle(0, 0, isBoss ? 25 : 10, isBoss ? 0xff0000 : 0x000000);
    scene.physics.add.existing(enemy);

    enemy.health = health;
    enemy.t = 0;
    enemy.speed = isGato ? 1.5 : 0.6; // Reduced speed values
    enemy.speedModifier = 1;
    enemies.add(enemy);
}

function selectTower(type) {
    // Se clicar no mesmo Smurf, desseleciona
    if (selectedTowerType === type) {
        clearSelection();
        return;
    }

    selectedTowerType = type;
    console.log("Selecionado:", type);

    // UI Update
    document.querySelectorAll('.tower-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-${type}`);
    if (activeBtn) activeBtn.classList.add('active');
}

function placeTower(scene, x, y) {
    const data = TOWER_DATA[selectedTowerType];
    updateCurrency(-data.cost);

    const towerContainer = scene.add.container(x, y);
    const base = scene.add.circle(0, 0, 20, data.color);
    const rangeCircle = scene.add.circle(0, 0, data.range, 0xffffff, 0.1);
    rangeCircle.setStrokeStyle(1, 0xffffff, 0.5);
    rangeCircle.visible = false; // Escondido por padrão

    towerContainer.add([rangeCircle, base]);
    towerContainer.setSize(40, 40);
    towerContainer.setInteractive();
    towerContainer.rangeCircle = rangeCircle;

    // Mostrar range ao clicar na torre
    towerContainer.on('pointerdown', (pointer, localX, localY, event) => {
        event.stopPropagation(); // Evita que o mapa esconda o range imediatamente
        towers.getChildren().forEach(t => t.rangeCircle.visible = false); // Fecha outros
        rangeCircle.visible = !rangeCircle.visible;
    });

    const tower = {
        x: x,
        y: y,
        type: selectedTowerType,
        range: data.range,
        damage: data.damage,
        fireRate: data.fireRate,
        slow: data.slow || null,
        bulletSpeed: data.bulletSpeed,
        nextShot: 0,
        rangeCircle: rangeCircle // Referência para manipular depois
    };

    towers.add(tower);

    // Limpa imediatamente e reforça após um frame
    clearSelection();
    setTimeout(clearSelection, 50);
}

function clearSelection() {
    selectedTowerType = null;

    // Remove a classe de todos os botões de forma agressiva
    const buttons = document.getElementsByClassName('tower-btn');
    for (let btn of buttons) {
        btn.classList.remove('active');
    }

    console.log("Seleção limpa com sucesso.");
}

function shoot(scene, tower, target) {
    const bullet = scene.add.circle(tower.x, tower.y, 5, 0xffffff);
    scene.physics.add.existing(bullet);
    bullets.add(bullet); // Add to group before setting velocity

    bullet.body.setAllowGravity(false);
    scene.physics.moveToObject(bullet, target, tower.bulletSpeed);

    bullet.damage = tower.damage;
    bullet.slow = tower.slow;

    // Auto-destroy bullet after 2 seconds
    scene.time.delayedCall(2000, () => { if (bullet.active) bullet.destroy(); });
}

function getClosestEnemy(tower) {
    let closest = null;
    let minDist = Infinity;

    enemies.getChildren().forEach(enemy => {
        const dist = Phaser.Math.Distance.Between(tower.x, tower.y, enemy.x, enemy.y);
        if (dist < tower.range && dist < minDist) {
            minDist = dist;
            closest = enemy;
        }
    });
    return closest;
}

function updateCurrency(amount) {
    currency += amount;
    updateUI();
}

function updateUI() {
    document.getElementById('currency').innerText = currency;
    document.getElementById('lives').innerText = lives;
    document.getElementById('wave').innerText = wave;
}

function gameOver() {
    document.getElementById('game-over').classList.remove('hidden');
    game.scene.pause('default');
}
