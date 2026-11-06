const fs = require('fs');
const file = 'public/index.html';
let content = fs.readFileSync(file, 'utf8');

// On cherche l'ancien bouton "Mon Compte" qui était caché sur mobile
const oldBtn = `<a href="/compte.html" class="text-xs font-space font-bold text-nebula-cyan hover:text-white transition-colors hidden sm:block">Mon Compte</a>`;

// On le remplace par un bouton avec une icône visible sur mobile
const newBtn = `<a href="/compte.html" class="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 text-xs font-space font-bold text-gray-300 hover:text-white hover:border-nebula-cyan transition-all">
    <i data-lucide="user" class="w-4 h-4 text-nebula-cyan"></i>
    <span class="hidden sm:inline">Mon Compte</span>
</a>`;

if (content.includes(oldBtn)) {
    content = content.replace(oldBtn, newBtn);
    fs.writeFileSync(file, content, 'utf8');
    console.log("✅ index.html : Bouton Mon Compte rendu visible sur mobile avec une icône.");
} else {
    console.log("⚠️ Impossible de trouver l'ancien bouton. Le code a peut-être déjà changé.");
}
