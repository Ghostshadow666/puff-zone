// --- ANIMATION FOND PREMIUM (NÉBULEUSE + ÉTOILES + FUMÉE) ---
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');

let width, height;
let stars = [];
const starCount = 80;

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- ÉTOILES / PARTICULES ---
class Star {
    constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.radius = Math.random() * 1.5 + 0.5;
        this.vx = (Math.random() - 0.5) * 0.2;
        this.vy = (Math.random() - 0.5) * 0.2;
        this.opacity = Math.random() * 0.5 + 0.1;
        this.color = Math.random() > 0.5 ? '34, 211, 238' : '168, 85, 247'; // Cyan ou Violet
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > width) this.vx *= -1;
        if (this.y < 0 || this.y > height) this.vy *= -1;
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${this.color}, ${this.opacity})`;
        ctx.fill();
    }
}

for (let i = 0; i < starCount; i++) {
    stars.push(new Star());
}

// --- FUMÉE (Vape) ---
class SmokeParticle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = Math.random() * 30 + 20;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = -(Math.random() * 0.5 + 0.2); // Monte
        this.opacity = Math.random() * 0.1 + 0.05;
        this.life = 1.0;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.radius += 0.3; // La fumée s'étend
        this.life -= 0.005;
        this.opacity = Math.max(0, this.life * 0.15);
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 210, 255, ${this.opacity})`; // Fumée bleutée
        ctx.fill();
    }
}

let smokeParticles = [];
// Position initiale de la fumée (sera mise à jour par rapport à la puff)
let puffX = width - 150; // En bas à droite par défaut
let puffY = height - 100;

function spawnSmoke() {
    // On génère de la fumée depuis le haut de la puff (environ 100px plus haut)
    smokeParticles.push(new SmokeParticle(puffX + (Math.random() * 20 - 10), puffY - 80));
}

setInterval(spawnSmoke, 100); // Génère de la fumée toutes les 100ms

// --- BOUCLE D'ANIMATION ---
function animate() {
    ctx.clearRect(0, 0, width, height);

    // 1. Mise à jour des étoiles
    stars.forEach(s => {
        s.update();
        s.draw();
    });

    // 2. Mise à jour de la fumée
    smokeParticles.forEach((p, index) => {
        p.update();
        p.draw();
        if (p.life <= 0) {
            smokeParticles.splice(index, 1);
        }
    });

    requestAnimationFrame(animate);
}

animate();

// Mettre à jour la position de la fumée si la fenêtre change
window.addEventListener('resize', () => {
    puffX = width - 150;
    puffY = height - 100;
});