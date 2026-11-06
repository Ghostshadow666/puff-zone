const fs = require('fs');
const file = 'public/script.js';
let content = fs.readFileSync(file, 'utf8');

// On cherche le début de la fonction renderCatalogue
const startIdx = content.indexOf('function renderCatalogue()');
if (startIdx !== -1) {
    // On trouve la fin de la fonction en comptant les accolades
    let braceCount = 0;
    let inFunction = false;
    let endIdx = -1;
    
    for (let i = startIdx; i < content.length; i++) {
        if (content[i] === '{') { braceCount++; inFunction = true; }
        else if (content[i] === '}') {
            braceCount--;
            if (inFunction && braceCount === 0) { endIdx = i; break; }
        }
    }

    if (endIdx !== -1) {
        // La nouvelle fonction 100% propre avec les catégories fermées et les prix des lots
        const newRender = `function renderCatalogue() {
    const container = document.getElementById('product-list');
    if(!container) return;

    if (allCategories.length === 0) {
        container.innerHTML = \`<div class="text-center py-12 glass-panel rounded-2xl"><h3 class="font-space font-bold text-lg text-white mb-2">Aucune catégorie</h3><p class="text-gray-400 text-sm">La galaxie est en cours de préparation.</p></div>\`;
        return;
    }

    let html = '';
    allCategories.forEach(cat => {
        const catFlavors = allFlavors.filter(f => f.categorie_id === cat.id);
        const catImg = cat.image_url || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23151028"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="40">📦</text></svg>';

        let cardsHtml = '';
        catFlavors.forEach(f => {
            const isOut = f.stock <= 0;
            cardsHtml += \`
            <div class="bg-space-surface/80 border border-white/10 rounded-xl p-2.5 flex flex-col justify-between group hover:border-nebula-cyan/50 transition-all">
                <div class="flex justify-between items-start mb-1">
                    <span class="text-[10px] font-bold text-white truncate max-w-[90px]">\${f.nom}</span>
                    <span class="text-[9px] font-bold \${isOut ? 'text-red-400' : 'text-green-400'}">\${isOut ? 'RUPTURE' : 'STK:'+f.stock}</span>
                </div>
                <div class="flex justify-between items-center mt-2">
                    <span class="font-bold text-nebula-cyan text-xs">\${parseFloat(cat.prix_unite).toFixed(2)}€</span>
                    \${isOut ? \`<button disabled class="px-2 py-1 rounded bg-gray-800 text-gray-500 text-[10px] cursor-not-allowed">&times;</button>\` : \`<button onclick="addToCart(\${f.id})" class="px-2 py-1 rounded-lg bg-gradient-to-r from-nebula-violet to-nebula-magenta text-white shadow-lg hover:opacity-90 flex items-center justify-center transition-transform hover:scale-105"><i data-lucide="plus" class="w-3.5 h-3.5"></i></button>\`}
                </div>
            </div>\`;
        });

        // Génération des badges de prix (U, Lot 5, Lot 10)
        let pricesHtml = \`<div class="flex gap-2 mt-2 flex-wrap">
            <span class="text-[10px] font-bold text-white bg-black/40 px-2 py-0.5 rounded">U: \${cat.prix_unite}€</span>\`;
        if (cat.prix_lot_5) pricesHtml += \`<span class="text-[10px] font-bold text-nebula-cyan bg-nebula-cyan/10 px-2 py-0.5 rounded border border-nebula-cyan/30">Lot 5: \${cat.prix_lot_5}€</span>\`;
        if (cat.prix_lot_10) pricesHtml += \`<span class="text-[10px] font-bold text-nebula-magenta bg-nebula-magenta/10 px-2 py-0.5 rounded border border-nebula-magenta/30">Lot 10: \${cat.prix_lot_10}€</span>\`;
        pricesHtml += \`</div>\`;

        // On génère la catégorie avec la classe 'hidden' par défaut
        html += \`
        <div class="glass-panel rounded-2xl overflow-hidden border border-white/10 mb-4">
            <div class="flex justify-between items-center p-4 cursor-pointer hover:bg-white/5 transition-colors" onclick="toggleCategory(\${cat.id})">
                <div class="flex items-center gap-4">
                    <img src="\${catImg}" class="w-12 h-12 object-cover rounded-lg border border-white/10">
                    <div>
                        <h3 class="font-space font-bold text-lg text-white flex items-center gap-3">
                            \${cat.nom}
                            <span class="text-xs font-normal bg-nebula-violet/20 text-nebula-cyan px-2 py-0.5 rounded-full border border-nebula-violet/30">\${catFlavors.length} produit\${catFlavors.length > 1 ? 's' : ''}</span>
                        </h3>
                        \${pricesHtml}
                    </div>
                </div>
                <i data-lucide="chevron-down" id="arrow-\${cat.id}" class="text-nebula-cyan transition-transform duration-300" style="transform: rotate(-90deg);"></i>
            </div>
            <div id="cat-grid-\${cat.id}" class="p-4 border-t border-white/10 hidden">
                \${catFlavors.length > 0 ? \`<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">\${cardsHtml}</div>\` : \`<div class="text-center text-gray-500 text-sm italic py-4">Bientôt disponible...</div>\`}
            </div>
        </div>\`;
    });

    container.innerHTML = html;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}`;

        content = content.substring(0, startIdx) + newRender + content.substring(endIdx + 1);
        fs.writeFileSync(file, content, 'utf8');
        console.log("✅ script.js : renderCatalogue entièrement réécrit (fermé par défaut + prix des lots)");
    } else {
        console.log("❌ Impossible de trouver la fin de la fonction.");
    }
} else {
    console.log("❌ Fonction renderCatalogue non trouvée.");
}
