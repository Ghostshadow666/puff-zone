const fs = require('fs');
const file = 'public/admin.html';
let content = fs.readFileSync(file, 'utf8');

// On cherche la fonction renderCatalogue
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
        // Nouvelle fonction blindée avec les images en %22 au lieu de "
        const newRender = `function renderCatalogue() {
            const el = document.getElementById('catalogueList'); 
            if(!allCategories.length){el.innerHTML='Aucune catégorie.';return;}
            
            el.innerHTML = allCategories.map(cat => {
                const flavs = allFlavors.filter(f=>f.categorie_id===cat.id);
                
                // L'image par défaut utilise %22 au lieu des guillemets pour ne pas casser le HTML
                const defaultImg = 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22><rect width=%2260%22 height=%2260%22 fill=%22%23222%22/><text x=%2250%%22 y=%2250%%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2224%22>📦</text></svg>';
                const img = cat.image_url || defaultImg;
                
                const safeNom = escapeHTML(cat.nom || 'Inconnu');

                return \`<div class="bg-space-surface/50 border border-white/10 rounded-xl mb-4 overflow-hidden">
                    <div class="p-4 flex items-center gap-4 cursor-pointer hover:bg-white/5 transition-colors" onclick="toggleAdminCategory(\${cat.id})">
                        <img src="\${img}" class="w-12 h-12 object-cover rounded-lg">
                        <div class="flex-1">
                            <div class="font-bold text-white text-sm flex items-center gap-2">\${safeNom} <span id="admin-arrow-\${cat.id}" class="text-nebula-cyan text-xs transition-transform">▼</span></div>
                            <div class="text-xs text-gray-400">U: \${cat.prix_unite}€</div>
                        </div>
                        <div class="flex gap-2" onclick="event.stopPropagation();">
                            <button class="px-3 py-1 bg-nebula-violet/20 text-nebula-cyan rounded text-xs" onclick="openFlavorModal(\${cat.id})">+ Saveur</button>
                            <button class="text-red-400 px-2" onclick="deleteCategory(\${cat.id})">🗑️</button>
                        </div>
                    </div>
                    <div id="admin-flavors-\${cat.id}" class="p-4 border-t border-white/5">\${flavs.map(f=>\`<div class="flex justify-between items-center py-2 border-b border-white/5 last:border-0"><div class="text-sm text-gray-300">\${escapeHTML(f.nom)}</div><div class="flex items-center gap-3"><span class="text-xs font-bold text-green-400">(\${f.stock})</span><button class="text-red-400 text-xs" onclick="deleteFlavor(\${f.id})">🗑️</button></div></div>\`).join('')}</div>
                </div>\`;
            }).join('');
        }`;
        
        // On remplace l'ancienne fonction par la nouvelle
        content = content.substring(0, startIdx) + newRender + content.substring(endIdx + 1);
        
        // On s'assure que escapeHTML est présent
        if (!content.includes('function escapeHTML')) {
            content = content.replace('let editingZoneId = null;', 'let editingZoneId = null;\n        function escapeHTML(str) { if(!str) return \'\'; return str.replace(/&/g, \'&amp;\').replace(/</g, \'&lt;\').replace(/>/g, \'&gt;\').replace(/"/g, \'&quot;\'); }');
        }

        fs.writeFileSync(file, content, 'utf8');
        console.log("✅ La fonction renderCatalogue a été remplacée avec succès !");
    } else {
        console.log("❌ Impossible de trouver la fin de la fonction.");
    }
} else {
    console.log("❌ Fonction renderCatalogue non trouvée.");
}
