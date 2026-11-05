// --- ANIMATION FOND CYBER-CORE (NEURONAL + SYNTHWAVE GRID) ---
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');

let width, height;
let particles = [];
const particleCount = 60;
const connectionDistance = 150;
const gridSpeed = 0.02;
let gridOffset = 0;

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// --- PARTICULES (Réseau Neuronal) ---
class Particle {
    constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height * 0.7; // Reste dans la partie haute
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.radius = Math.random() * 2 + 1;
        this.color = Math.random() > 0.5 ? '#22D3EE' : '#A855F7';
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        if (this.x < 0 || this.x > width) this.vx *= -1;
        if (this.y < 0 || this.y > height * 0.8) this.vy *= -1;
    }
    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fill();
        ctx.shadowBlur = 0;
    }
}

for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
}

// --- GRILLE SYNTHWAVE ---
function drawGrid() {
    const horizonY = height * 0.7; // L'horizon se situe à 70% de l'écran
    const centerX = width / 2;
    const vanishingPointY = horizonY;

    ctx.strokeStyle = 'rgba(168, 85, 247, 0.15)'; // Violet translucide
    ctx.lineWidth = 1;

    // Lignes verticales (perspective vers le point de fuite)
    for (let x = -width; x < width * 2; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, height);
        ctx.lineTo(centerX, vanishingPointY);
        ctx.stroke();
    }

    // Lignes horizontales (qui défilent vers l'avant)
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.2)'; // Cyan translucide
    const numLines = 20;
    for (let i = 0; i < numLines; i++) {
        // Effet de perspective mathématique
        let z = i + (gridOffset % 1);
        let y = vanishingPointY + (height - vanishingPointY) / z;
        
        if (y > height) continue;

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    
    gridOffset += gridSpeed;
}

// --- BOUCLE D'ANIMATION ---
function animate() {
    ctx.clearRect(0, 0, width, height);

    // 1. Dessin de la grille (en bas)
    drawGrid();

    // 2. Mise à jour et dessin des particules (en haut)
    particles.forEach(p => {
        p.update();
        p.draw();
    });

    // 3. Connexions entre particules (Réseau)
    for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < connectionDistance) {
                ctx.beginPath();
                ctx.moveTo(particles[i].x, particles[i].y);
                ctx.lineTo(particles[j].x, particles[j].y);
                // L'opacité dépend de la distance
                const opacity = 1 - (dist / connectionDistance);
                ctx.strokeStyle = `rgba(34, 211, 238, ${opacity * 0.3})`;
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
    }

    requestAnimationFrame(animate);
}

animate();