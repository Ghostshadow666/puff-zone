const fs = require('fs');
const file = 'public/admin.html';
let content = fs.readFileSync(file, 'utf8');

// 1. Modification de la fonction renderCatalogue pour inclure le bouton Modifier et l'alerte de stock
const startIdx = content.indexOf('function renderCatalogue()');
if (startIdx !== -1) {
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
        const newRender = `function renderCatalogue() {
            const el = document.getElementById('catalogueList'); 
            if(!allCategories.length){el.innerHTML='Aucune catégorie.';return;}
            
            // Gestion du badge d'alerte global sur l'onglet Stock
            const lowStockItems = allFlavors.filter(f => f.stock < 2);
            const stockTabBtn = document.querySelector('button[onclick*="tab-stock"]');
            
            if (stockTabBtn) {
                stockTabBtn.classList.add('relative'); // Assure le positionnement
                let badge = document.getElementById('stock-alert-badge');
                if (lowStockItems.length > 0) {
                    if (!badge) {
                        stockTabBtn.innerHTML += \` <span id="stock-alert-badge" class="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[8px] font-bold animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]">\${lowStockItems.length}</span>\`;
                    } else {
                        badge.innerText = lowStockItems.length;
                    }
                } else if (badge) {
                    badge.remove();
                }
            }

            el.innerHTML = allCategories.map(cat => {
                const flavs = allFlavors.filter(f=>f.categorie_id===cat.id);
                
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
                            <button class="px-3 py-1 bg-white/10 text-white rounded text-xs" onclick="editCategory(\${cat.id})">✏️</button>
                            <button class="text-red-400 px-2" onclick="deleteCategory(\${cat.id})">🗑️</button>
                        </div>
                    </div>
                    <div id="admin-flavors-\${cat.id}" class="p-4 border-t border-white/5" style="display: none;">
                        \${flavs.map(f => {
                            // Alerte visuelle si le stock est < 2
                            const isLow = f.stock < 2;
                            const stockClass = isLow ? 'text-red-500 animate-pulse font-extrabold' : 'text-green-400 font-bold';
                            const alertIcon = isLow ? '⚠️ ' : '';

                            return \`<div class="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                                <div class="text-sm text-gray-300">\${escapeHTML(f.nom)}</div>
                                <div class="flex items-center gap-3">
                                    <span class="text-xs \${stockClass}">\${alertIcon}(\${f.stock})</span>
                                    <button class="text-nebula-cyan text-xs hover:scale-110 transition-transform" onclick="openFlavorModal(\${cat.id}, \${f.id})">✏️</button>
                                    <button class="text-red-400 text-xs hover:scale-110 transition-transform" onclick="deleteFlavor(\${f.id})">🗑️</button>
                                </div>
                            </div>\`;
                        }).join('')}
                    </div>
                </div>\`;
            }).join('');
        }`;
        
        content = content.substring(0, startIdx) + newRender + content.substring(endIdx + 1);
        
        fs.writeFileSync(file, content, 'utf8');
        console.log("✅ Le catalogue a été mis à jour (Boutons Modifier + Alertes Stock) !");
    } else {
        console.log("❌ Impossible de trouver la fin de la fonction.");
    }
} else {
    console.log("❌ Fonction renderCatalogue non trouvée.");
}
