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
    document.getElementById('btn-robust').onclick = () => selectTower('robust');
    document.getElementById('btn-genius').onclick = () => selectTower('genius');
    document.getElementById('btn-ette').onclick = () => selectTower('ette');

    this.input.on('pointerdown', (pointer) => {
        if (selectedTowerType && currency >= TOWER_DATA[selectedTowerType].cost) {
            placeTower(this, pointer.x, pointer.y);
        }
    });

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

function update(time) {
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

    // Enemy movement
    enemies.getChildren().forEach(enemy => {
        enemy.t += (0.0005 * enemy.speed * enemy.speedModifier);
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
    enemy.speed = isGato ? 2.5 : 1.0;
    enemy.speedModifier = 1;
    enemies.add(enemy);
}

function selectTower(type) {
    selectedTowerType = type;
    document.querySelectorAll('.tower-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-${type}`).classList.add('active');
}

function placeTower(scene, x, y) {
    const data = TOWER_DATA[selectedTowerType];
    updateCurrency(-data.cost);

    const towerContainer = scene.add.container(x, y);
    const base = scene.add.circle(0, 0, 20, data.color);
    const rangeCircle = scene.add.circle(0, 0, data.range, 0xffffff, 0.1);
    rangeCircle.setStrokeStyle(1, 0xffffff, 0.5);

    towerContainer.add([rangeCircle, base]);

    const tower = {
        x: x,
        y: y,
        type: selectedTowerType,
        range: data.range,
        damage: data.damage,
        fireRate: data.fireRate,
        slow: data.slow || null,
        bulletSpeed: data.bulletSpeed,
        nextShot: 0
    };

    towers.add(tower);
    selectedTowerType = null;
    document.querySelectorAll('.tower-btn').forEach(btn => btn.classList.remove('active'));
}

function shoot(scene, tower, target) {
    const bullet = scene.add.circle(tower.x, tower.y, 5, 0xffffff);
    scene.physics.add.existing(bullet);

    scene.physics.moveToObject(bullet, target, tower.bulletSpeed);
    bullet.damage = tower.damage;
    bullet.slow = tower.slow;
    bullets.add(bullet);

    // Auto-destroy bullet after range
    scene.time.delayedCall(1000, () => { if (bullet.active) bullet.destroy(); });
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
