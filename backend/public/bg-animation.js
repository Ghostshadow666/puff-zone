// --- ANIMATION FOND PREMIUM (ÉTOILES UNIQUEMENT) ---
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');

let width, height;
let stars = [];
const starCount = 120; // Un peu plus d'étoiles pour le fond

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
        this.vx = (Math.random() - 0.5) * 0.15; // Mouvement très lent
        this.vy = (Math.random() - 0.5) * 0.15;
        this.opacity = Math.random() * 0.6 + 0.1;
        // Alternance Cyan / Violet
        this.color = Math.random() > 0.5 ? '34, 211, 238' : '168, 85, 247'; 
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

// --- BOUCLE D'ANIMATION ---
function animate() {
    ctx.clearRect(0, 0, width, height);
    stars.forEach(s => {
        s.update();
        s.draw();
    });
    requestAnimationFrame(animate);
}

animate();