const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    backgroundColor: '#0c0c0c', /* Dark asphalt */
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

let car;
let cursors;
let spaceKey;
let speedometerText;
let timerText;
let startTime;
let particles;
let trails;

let speedLines;

function preload() {
    // Tenta carregar o sprite do carro gerado
    this.load.image('car_sprite', 'assets/car.png');

    // Smoke particle placeholder (using graphics for efficiency)
    const graphics = this.add.graphics();

    // Fallback: Se o car.png falhar, o Phaser usará a chave 'car_sprite'. 
    // Criamos uma textura de fallback com o mesmo nome caso a imagem não carregue.
    graphics.fillStyle(0xffffff, 1);
    graphics.fillRect(0, 0, 40, 20);
    graphics.fillStyle(0x000000, 1);
    graphics.fillRect(0, 0, 40, 5);
    graphics.fillRect(0, 15, 40, 5);
    graphics.generateTexture('car_fallback', 40, 20);

    graphics.clear();
    graphics.fillStyle(0xaaaaaa, 0.5);
    graphics.fillCircle(5, 5, 5);
    graphics.generateTexture('smoke', 10, 10);

    // Speed lines graphics
    const lines = this.add.graphics();
    lines.lineStyle(2, 0xffffff, 0.2);
    for (let i = 0; i < 20; i++) {
        lines.lineBetween(Math.random() * 800, 0, Math.random() * 800, 600);
    }
    lines.generateTexture('speedline', 800, 600);
    graphics.destroy();
    lines.destroy();
}

function create() {
    // UI elements from HTML (speedometer and timer sync)
    speedometerText = document.getElementById('speedometer');
    timerText = document.getElementById('timer');
    startTime = this.time.now;

    // Road track graphics
    const road = this.add.graphics();
    road.lineStyle(80, 0x1a1a1a); // Highway width
    road.beginPath();
    road.moveTo(-100, 300);
    road.lineTo(900, 300); // Simple straight for testing, modify logic as needed
    road.strokePath();

    road.lineStyle(2, 0xffffff, 0.4);
    road.lineBetween(-100, 260, 900, 260); // Top lane line
    road.lineBetween(-100, 340, 900, 340); // Bottom lane line

    // Speed Lines Effect
    speedLines = this.add.sprite(400, 300, 'speedline').setOrigin(0.5).setAlpha(0);

    // Car setup: Verifica se a imagem carregou, senão usa fallback
    const carKey = this.textures.exists('car_sprite') ? 'car_sprite' : 'car_fallback';
    car = this.physics.add.sprite(150, 300, carKey);

    if (carKey === 'car_sprite') {
        car.setScale(0.15);
    } else {
        car.setScale(1); // Fallback já está no tamanho certo
    }

    car.setOrigin(0.5, 0.5);
    car.setDrag(100);
    car.setMaxVelocity(350);
    car.setAngularDrag(1500);

    // Particles (Smoke)
    particles = this.add.particles(0, 0, 'smoke', {
        speed: { min: 20, max: 80 },
        scale: { start: 1, end: 0 },
        alpha: { start: 0.5, end: 0 },
        lifespan: 500,
        blendMode: 'NORMAL',
        frequency: -1 // Manual emit during drift
    });

    // Inputs
    cursors = this.input.keyboard.createCursorKeys();
    // Support WASD too
    this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D
    });

    spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Initial Physics Properties
    car.speed = 0;
    car.accel = 180;
    car.steering = 0.15;
    car.driftFactor = 0.95; // 1 = no drift, lower = more drift
}

function update(time, delta) {
    const isHandbrake = spaceKey.isDown;
    const isAccelerating = cursors.up.isDown || this.input.keyboard.addKey('W').isDown;
    const isBraking = cursors.down.isDown || this.input.keyboard.addKey('S').isDown;
    const turnLeft = cursors.left.isDown || this.input.keyboard.addKey('A').isDown;
    const turnRight = cursors.right.isDown || this.input.keyboard.addKey('D').isDown;

    // Calculamos a velocidade para exibição antes de usar
    const displaySpeed = Math.floor(Math.abs(car.speed));

    // 1. Steering
    if (turnLeft) {
        car.setAngularVelocity(-180);
    } else if (turnRight) {
        car.setAngularVelocity(180);
    } else {
        car.setAngularVelocity(0);
    }

    // 2. Acceleration / Deceleration
    if (isAccelerating) {
        car.speed += car.accel * (delta / 1000);
    } else if (isBraking) {
        car.speed -= car.accel * (delta / 500);
    } else {
        car.speed *= 0.99; // Rolling friction
    }

    // Handbrake: Slow down speed but keep momentum (lower driftFactor)
    let currentDriftFactor = car.driftFactor;
    if (isHandbrake) {
        car.speed *= 0.98;
        currentDriftFactor = 0.7; // Harder sliding
    }

    // Clamp speed
    car.speed = Phaser.Math.Clamp(car.speed, -50, car.setMaxVelocity().maxVelocity.x);

    // 3. Drift Physics (Slip Angle)
    // We update the velocity gradually towards the heading direction
    const headingX = Math.cos(car.rotation) * car.speed;
    const headingY = Math.sin(car.rotation) * car.speed;

    // Lerp velocity toward heading (drift mechanic)
    if (car.body) {
        car.body.velocity.x = car.body.velocity.x * currentDriftFactor + headingX * (1 - currentDriftFactor);
        car.body.velocity.y = car.body.velocity.y * currentDriftFactor + headingY * (1 - currentDriftFactor);
    }

    // 5. Visual Effects (Smoke & Speed Lines)
    let driftIntensity = 0;
    if (car.body) {
        driftIntensity = Math.abs(car.body.velocity.angle() - car.rotation);
    }

    if ((isHandbrake && car.speed > 50) || (driftIntensity > 0.2 && car.speed > 100)) {
        particles.emitParticleAt(car.x, car.y);
    }

    // Speed Lines Alpha (Anime style)
    if (displaySpeed > 200) {
        if (speedLines) {
            speedLines.setAlpha((displaySpeed - 200) / 150);
            speedLines.x = 400 + Math.random() * 5; // Shake effect
        }
    } else if (speedLines) {
        speedLines.setAlpha(0);
    }

    // 6. UI Updates
    if (speedometerText) speedometerText.innerText = `${displaySpeed} KM/H`;

    const elapsed = time - startTime;
    const minutes = Math.floor(elapsed / 60000).toString().padStart(2, '0');
    const seconds = Math.floor((elapsed % 60000) / 1000).toString().padStart(2, '0');
    const ms = Math.floor((elapsed % 1000) / 10).toString().padStart(2, '0');
    if (timerText) timerText.innerText = `${minutes}:${seconds}.${ms}`;
}
