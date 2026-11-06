const fs = require('fs');

// ==========================================
// 1. CÔTÉ CLIENT (public/script.js)
// ==========================================
let scriptContent = fs.readFileSync('public/script.js', 'utf8');

// 1.1 On modifie l'affichage pour inclure les prix des lots
// On cherche la ligne qui affiche le badge de prix dans l'en-tête de la catégorie
const oldPriceBadge = `<span class="price-badge">Dès \${cat.prix_unite}\u20AC</span>`;
// On vérifie si c'est bien cette ligne (au cas où l'encodage ait changé)
let targetPriceLine = "Dès ${cat.prix_unite}€";
if (scriptContent.includes(targetPriceLine)) {
    const newPriceBadge = `<div class="flex gap-2 justify-center mt-2 flex-wrap">
            <span class="text-xs font-bold text-white bg-black/40 px-2 py-1 rounded">U: \${cat.prix_unite}€</span>
            \${cat.prix_lot_5 ? \`<span class="text-xs font-bold text-nebula-cyan bg-nebula-cyan/10 px-2 py-1 rounded border border-nebula-cyan/30">Lot 5: \${cat.prix_lot_5}€</span>\` : ''}
            \${cat.prix_lot_10 ? \`<span class="text-xs font-bold text-nebula-magenta bg-nebula-magenta/10 px-2 py-1 rounded border border-nebula-magenta/30">Lot 10: \${cat.prix_lot_10}€</span>\` : ''}
        </div>`;
    // On remplace la ligne du badge par le nouveau bloc (on garde la balise parente si besoin)
    scriptContent = scriptContent.replace(/<span class="price-badge"[^>]*>Dès \$\{cat\.prix_unite\}[^<]*<\/span>/, newPriceBadge);
}

// 1.2 On réduit les catégories par défaut
// On ajoute la classe 'hidden' au conteneur et on tourne la flèche
scriptContent = scriptContent.replace(
    '<div id="cat-grid-${cat.id}" class="p-4 border-t border-white/10">',
    '<div id="cat-grid-${cat.id}" class="p-4 border-t border-white/10 hidden">'
);
scriptContent = scriptContent.replace(
    '<i data-lucide="chevron-down" id="arrow-${cat.id}" class="text-nebula-cyan transition-transform duration-300"></i>',
    '<i data-lucide="chevron-down" id="arrow-${cat.id}" class="text-nebula-cyan transition-transform duration-300" style="transform: rotate(-90deg);"></i>'
);

fs.writeFileSync('public/script.js', scriptContent, 'utf8');
console.log("✅ script.js : Catégories réduites par défaut + Affichage des prix des lots");


// ==========================================
// 2. CÔTÉ ADMIN (public/admin.html)
// ==========================================
let adminContent = fs.readFileSync('public/admin.html', 'utf8');

// On s'assure que la flèche est tournée à -90deg par défaut dans l'admin
adminContent = adminContent.replace(
    '<span id="admin-arrow-${cat.id}" class="text-nebula-cyan text-xs transition-transform">▼</span>',
    '<span id="admin-arrow-${cat.id}" class="text-nebula-cyan text-xs transition-transform" style="transform: rotate(-90deg); display: inline-block;">▼</span>'
);

// On s'assure que le conteneur des saveurs est bien caché par défaut
adminContent = adminContent.replace(
    '<div id="admin-flavors-${cat.id}" class="p-4 border-t border-white/5" style="display: none;">',
    '<div id="admin-flavors-${cat.id}" class="p-4 border-t border-white/5 hidden">'
);

// Et on met à jour la fonction toggleAdminCategory pour utiliser la classe 'hidden'
const oldToggleAdmin = `function toggleAdminCategory(catId) { 
            const list = document.getElementById(\`admin-flavors-\${catId}\`); 
            const arrow = document.getElementById(\`admin-arrow-\${catId}\`); 
            if (list.style.display === 'none' || list.style.display === '') { 
                list.style.display = 'block'; 
                arrow.style.transform = 'rotate(0deg)'; 
            } else { 
                list.style.display = 'none'; 
                arrow.style.transform = 'rotate(-90deg)'; 
            } 
        }`;
const newToggleAdmin = `function toggleAdminCategory(catId) { 
            const list = document.getElementById(\`admin-flavors-\${catId}\`); 
            const arrow = document.getElementById(\`admin-arrow-\${catId}\`); 
            if (list.classList.contains('hidden')) { 
                list.classList.remove('hidden'); 
                arrow.style.transform = 'rotate(0deg)'; 
            } else { 
                list.classList.add('hidden'); 
                arrow.style.transform = 'rotate(-90deg)'; 
            } 
        }`;
        
if (adminContent.includes(oldToggleAdmin)) {
    adminContent = adminContent.replace(oldToggleAdmin, newToggleAdmin);
}

fs.writeFileSync('public/admin.html', adminContent, 'utf8');
console.log("✅ admin.html : Catégories réduites par défaut");
