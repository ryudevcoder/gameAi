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
let selectedTowerInstance = null;

const TOWER_DATA = {
    robust: { cost: 50, color: 0x3498db, range: 150, fireRate: 800, damage: 10, bulletSpeed: 400 },
    genius: { cost: 75, color: 0x9b59b6, range: 120, fireRate: 1200, damage: 2, bulletSpeed: 300, slow: 0.5 },
    ette: { cost: 120, color: 0xf1c40f, range: 250, fireRate: 2000, damage: 30, bulletSpeed: 600 }
};

function preload() {
    // We use graphics for placeholders as requested
}

function create() {
    // Define Path (S-shape/Snake)
    path = new Phaser.Curves.Path(0, 100);
    path.lineTo(750, 100);
    path.lineTo(750, 250);
    path.lineTo(150, 250);
    path.lineTo(150, 400);
    path.lineTo(750, 400);
    path.lineTo(750, 550);
    path.lineTo(0, 550);

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

    // Upgrade buttons
    document.getElementById('btn-up-damage').onclick = (e) => {
        e.stopPropagation();
        if (selectedTowerInstance) upgradeTowerStat(selectedTowerInstance, 'damage');
    };
    document.getElementById('btn-up-range').onclick = (e) => {
        e.stopPropagation();
        if (selectedTowerInstance) upgradeTowerStat(selectedTowerInstance, 'range');
    };
    document.getElementById('btn-sell').onclick = (e) => {
        e.stopPropagation();
        if (selectedTowerInstance) sellTower(selectedTowerInstance);
    };

    this.input.on('pointerdown', (pointer, currentlyOver) => {
        // Se clicar em um Smurf já posicionado, não faz nada aqui (o listener da torre cuida disso)
        if (currentlyOver.length > 0) return;

        // Se clicar no mapa (gramado) e tiver algo selecionado para construir
        if (selectedTowerType) {
            const cost = TOWER_DATA[selectedTowerType].cost;
            if (currency >= cost) {
                if (!isPointOnPath(pointer.x, pointer.y)) {
                    placeTower(this, pointer.x, pointer.y);
                } else {
                    this.cameras.main.shake(100, 0.005);
                }
            }
        } else {
            // Descelecionar torre se clicar no chão vazio
            deselectTowerInstance();
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
        const baseSpeed = 0.00002; // Reduced slightly as path is longer
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

    // Update bullets to home in on targets
    bullets.getChildren().forEach(bullet => {
        if (bullet.target && bullet.target.active) {
            this.physics.moveToObject(bullet, bullet.target, bullet.speed);
        } else {
            bullet.destroy();
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
    const pathWidth = 50;
    // Segment 1: H (0, 100) -> (750, 100)
    if (x >= 0 && x <= 770 && Math.abs(y - 100) < pathWidth) return true;
    // Segment 2: V (750, 100) -> (750, 250)
    if (Math.abs(x - 750) < pathWidth && y >= 80 && y <= 270) return true;
    // Segment 3: H (750, 250) -> (150, 250)
    if (x >= 130 && x <= 770 && Math.abs(y - 250) < pathWidth) return true;
    // Segment 4: V (150, 250) -> (150, 400)
    if (Math.abs(x - 150) < pathWidth && y >= 230 && y <= 420) return true;
    // Segment 5: H (150, 400) -> (750, 400)
    if (x >= 130 && x <= 770 && Math.abs(y - 400) < pathWidth) return true;
    // Segment 6: V (750, 400) -> (750, 550)
    if (Math.abs(x - 750) < pathWidth && y >= 380 && y <= 570) return true;
    // Segment 7: H (750, 550) -> (0, 550)
    if (x >= 0 && x <= 770 && Math.abs(y - 550) < pathWidth) return true;

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

    const tower = {
        x: x,
        y: y,
        container: towerContainer,
        type: selectedTowerType,
        range: data.range,
        baseRange: data.range,
        damage: data.damage,
        baseDamage: data.damage,
        fireRate: data.fireRate,
        slow: data.slow || null,
        bulletSpeed: data.bulletSpeed,
        nextShot: 0,
        rangeCircle: rangeCircle,
        damageLevel: 1,
        rangeLevel: 1
    };

    // Mostrar range e selecionar ao clicar na torre
    towerContainer.on('pointerdown', (pointer, localX, localY, event) => {
        if (event) event.stopPropagation();
        selectTowerInstance(tower);
    });

    // Mudar cursor ao passar o mouse
    towerContainer.on('pointerover', () => {
        scene.input.setDefaultCursor('pointer');
    });
    towerContainer.on('pointerout', () => {
        scene.input.setDefaultCursor('default');
    });

    towers.add(tower);

    // LIMPEZA ABSOLUTA
    clearSelection();
}

function selectTowerInstance(tower) {
    deselectTowerInstance();
    selectedTowerInstance = tower;

    // Mostrar range da torre selecionada
    towers.getChildren().forEach(t => t.rangeCircle.visible = false);
    tower.rangeCircle.visible = true;
    tower.rangeCircle.setStrokeStyle(2, 0xffff00, 1);

    // Mostrar painel de upgrade
    const panel = document.getElementById('upgrade-panel');
    panel.classList.remove('hidden');

    updateUpgradeUI();
}

function deselectTowerInstance() {
    selectedTowerInstance = null;
    document.getElementById('upgrade-panel').classList.add('hidden');
    towers.getChildren().forEach(t => {
        t.rangeCircle.visible = false;
        t.rangeCircle.setStrokeStyle(1, 0xffffff, 0.5);
    });
}

function updateUpgradeUI() {
    if (!selectedTowerInstance) return;

    const t = selectedTowerInstance;
    const data = TOWER_DATA[t.type];

    document.getElementById('upgrade-title').innerText = "Smurf " + t.type.charAt(0).toUpperCase() + t.type.slice(1);

    const damageCost = Math.floor(data.cost * 0.6 * t.damageLevel);
    const rangeCost = Math.floor(data.cost * 0.5 * t.rangeLevel);

    document.getElementById('up-damage-lvl').innerText = t.damageLevel;
    document.getElementById('up-range-lvl').innerText = t.rangeLevel;
    document.getElementById('up-damage-val').innerText = t.damage;
    document.getElementById('up-range-val').innerText = Math.floor(t.range);

    const nextDamage = t.baseDamage * (1 + t.damageLevel * 0.5);
    const nextRange = t.baseRange * (1 + t.rangeLevel * 0.3);

    document.getElementById('up-damage-next').innerText = nextDamage;
    document.getElementById('up-range-next').innerText = Math.floor(nextRange);

    const uiDamageCost = document.getElementById('up-damage-cost');
    const uiRangeCost = document.getElementById('up-range-cost');
    if (uiDamageCost) uiDamageCost.innerText = damageCost;
    if (uiRangeCost) uiRangeCost.innerText = rangeCost;

    const refund = Math.floor(data.cost * 0.7);
    document.getElementById('sell-refund').innerText = refund;

    const btnDamage = document.getElementById('btn-up-damage');
    const btnRange = document.getElementById('btn-up-range');

    if (t.damageLevel >= 3) {
        btnDamage.innerText = "NÍVEL MÁX";
        btnDamage.disabled = true;
        document.getElementById('up-damage-next').innerText = "MAX";
    } else {
        btnDamage.innerText = `Melhorar (${damageCost} 🍒)`;
        btnDamage.disabled = currency < damageCost;
    }

    if (t.rangeLevel >= 3) {
        btnRange.innerText = "NÍVEL MÁX";
        btnRange.disabled = true;
        document.getElementById('up-range-next').innerText = "MAX";
    } else {
        btnRange.innerText = `Melhorar (${rangeCost} 🍒)`;
        btnRange.disabled = currency < rangeCost;
    }
}

function upgradeTowerStat(tower, stat) {
    const data = TOWER_DATA[tower.type];
    if (stat === 'damage' && tower.damageLevel < 3) {
        const cost = Math.floor(data.cost * 0.6 * tower.damageLevel);
        if (currency >= cost) {
            updateCurrency(-cost);
            tower.damageLevel++;
            tower.damage = tower.baseDamage * (1 + (tower.damageLevel - 1) * 0.5); // +50% por nível
        }
    } else if (stat === 'range' && tower.rangeLevel < 3) {
        const cost = Math.floor(data.cost * 0.5 * tower.rangeLevel);
        if (currency >= cost) {
            updateCurrency(-cost);
            tower.rangeLevel++;
            tower.range = tower.baseRange * (1 + (tower.rangeLevel - 1) * 0.3); // +30% por nível
            tower.rangeCircle.setRadius(tower.range);
        }
    }
    updateUpgradeUI();
}

function sellTower(tower) {
    const data = TOWER_DATA[tower.type];
    const refund = Math.floor(data.cost * 0.7); // 70% de volta
    updateCurrency(refund);

    tower.container.destroy();
    towers.remove(tower);

    // Garante que o painel suma e a referência seja limpa
    deselectTowerInstance();
}

function clearSelection() {
    console.log("Limpando seleção...");
    selectedTowerType = null;

    // UI Update
    const buttons = document.querySelectorAll('.tower-btn');
    buttons.forEach(btn => {
        btn.classList.remove('active');
    });
}

function shoot(scene, tower, target) {
    const bullet = scene.add.circle(tower.x, tower.y, 5, 0xffffff);
    scene.physics.add.existing(bullet);
    bullets.add(bullet);

    bullet.body.setAllowGravity(false);
    bullet.target = target;
    bullet.speed = tower.bulletSpeed;
    bullet.damage = tower.damage;
    bullet.slow = tower.slow;

    // The movement is now handled in the update loop to ensure it always hits

    // Auto-destroy bullet after 4 seconds as a fallback
    scene.time.delayedCall(4000, () => { if (bullet.active) bullet.destroy(); });
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
    updateUpgradeUI(); // Update upgrade buttons status (enabled/disabled)
}

function gameOver() {
    document.getElementById('game-over').classList.remove('hidden');
    game.scene.pause('default');
}
