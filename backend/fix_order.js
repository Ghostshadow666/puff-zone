const fs = require('fs');

// ==========================================
// 1. MODIFICATION DU SERVEUR (server.js)
// ==========================================
let serverContent = fs.readFileSync('server.js', 'utf8');

// 1.1 Ajout de la colonne "ordre" dans la base de données (initDB)
const initTarget = "await pool.query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;');";
const initReplace = initTarget + `
    await pool.query('ALTER TABLE categories ADD COLUMN IF NOT EXISTS ordre INTEGER DEFAULT 0;');
    await pool.query('UPDATE categories SET ordre = id WHERE ordre = 0;'); // Initialisation de l'ordre pour les anciennes catégories
    `;
serverContent = serverContent.replace(initTarget, initReplace);

// 1.2 Modification de la route GET /api/catalogue (pour le client)
serverContent = serverContent.replace(
    "pool.query('SELECT * FROM categories ORDER BY is_featured DESC, nom ASC'),",
    "pool.query('SELECT * FROM categories ORDER BY ordre ASC, id ASC'),"
);

// 1.3 Modification de la route GET /api/categories (pour l'admin)
serverContent = serverContent.replace(
    "const r = await pool.query('SELECT * FROM categories ORDER BY nom ASC');",
    "const r = await pool.query('SELECT * FROM categories ORDER BY ordre ASC, id ASC');"
);

// 1.4 Ajout de la route pour sauvegarder le nouvel ordre
const newRoute = `
// --- NOUVEL ORDRE DES CATÉGORIES ---
app.put('/api/categories/reorder', authenticateToken, isAdmin, async (req, res) => {
  const { order } = req.body; // Tableau d'IDs dans le nouvel ordre
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < order.length; i++) {
      await client.query('UPDATE categories SET ordre = $1 WHERE id = $2', [i, order[i]]);
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Erreur lors de la mise à jour de l\\'ordre' });
  } finally {
    client.release();
  }
});

app.get('/api/categories', authenticateToken, isAdmin, async (req, res) => {`;
// On l'insère juste avant la route existante GET /api/categories
serverContent = serverContent.replace("app.get('/api/categories', authenticateToken, isAdmin, async (req, res) => {", newRoute);

fs.writeFileSync('server.js', serverContent, 'utf8');
console.log("✅ server.js : Base de données et routes mises à jour pour l'ordre des catégories.");


// ==========================================
// 2. MODIFICATION DE L'ADMIN (admin.html)
// ==========================================
let adminContent = fs.readFileSync('public/admin.html', 'utf8');

// 2.1 Ajout de la librairie SortableJS (Drag & Drop)
if (!adminContent.includes('Sortable.min.js')) {
    adminContent = adminContent.replace(
        '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>',
        '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>\n    <script src="https://cdn.jsdelivr.net/npm/sortablejs@latest/Sortable.min.js"></script>'
    );
}

// 2.2 Modification de la fonction renderCatalogue
const startIdx = adminContent.indexOf('function renderCatalogue()');
if (startIdx !== -1) {
    let braceCount = 0;
    let inFunction = false;
    let endIdx = -1;
    
    for (let i = startIdx; i < adminContent.length; i++) {
        if (adminContent[i] === '{') { braceCount++; inFunction = true; }
        else if (adminContent[i] === '}') {
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
                stockTabBtn.classList.add('relative');
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

            // On englobe le tout dans une div avec l'ID pour le Drag & Drop
            let html = '<div id="sortable-categories">';

            html += allCategories.map(cat => {
                const flavs = allFlavors.filter(f=>f.categorie_id===cat.id);
                
                const defaultImg = 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22><rect width=%2260%22 height=%2260%22 fill=%22%23222%22/><text x=%2250%%22 y=%2250%%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-size=%2224%22>📦</text></svg>';
                const img = cat.image_url || defaultImg;
                const safeNom = escapeHTML(cat.nom || 'Inconnu');

                return \`<div class="bg-space-surface/50 border border-white/10 rounded-xl mb-4 overflow-hidden" data-id="\${cat.id}">
                    <div class="p-4 flex items-center gap-4 hover:bg-white/5 transition-colors">
                        <!-- Poignée de glissement -->
                        <div class="drag-handle cursor-grab active:cursor-grabbing text-gray-500 hover:text-white p-2">
                            <i data-lucide="grip-vertical" class="w-5 h-5"></i>
                        </div>
                        
                        <div class="flex-1 flex items-center gap-4 cursor-pointer" onclick="toggleAdminCategory(\${cat.id})">
                            <img src="\${img}" class="w-12 h-12 object-cover rounded-lg">
                            <div>
                                <div class="font-bold text-white text-sm flex items-center gap-2">\${safeNom} <span id="admin-arrow-\${cat.id}" class="text-nebula-cyan text-xs transition-transform" style="transform: rotate(-90deg); display: inline-block;">▼</span></div>
                                <div class="text-xs text-gray-400">U: \${cat.prix_unite}€</div>
                            </div>
                        </div>
                        
                        <div class="flex gap-2">
                            <button class="px-3 py-1 bg-nebula-violet/20 text-nebula-cyan rounded text-xs" onclick="openFlavorModal(\${cat.id})">+ Saveur</button>
                            <button class="px-3 py-1 bg-white/10 text-white rounded text-xs" onclick="editCategory(\${cat.id})">✏️</button>
                            <button class="text-red-400 px-2" onclick="deleteCategory(\${cat.id})">🗑️</button>
                        </div>
                    </div>
                    <div id="admin-flavors-\${cat.id}" class="p-4 border-t border-white/5 hidden">
                        \${flavs.map(f => {
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
            
            html += '</div>';
            el.innerHTML = html;
            
            lucide.createIcons();

            // Initialisation du Drag & Drop
            if (document.getElementById('sortable-categories')) {
                new Sortable(document.getElementById('sortable-categories'), {
                    handle: '.drag-handle',
                    animation: 150,
                    ghostClass: 'opacity-50',
                    onEnd: async function (evt) {
                        const items = Array.from(document.getElementById('sortable-categories').children);
                        const newOrder = items.map(item => parseInt(item.getAttribute('data-id')));
                        
                        // On sauvegarde le nouvel ordre en arrière-plan
                        try {
                            await fetch(\`\${API_URL}/categories/reorder\`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ order: newOrder })
                            });
                            // On met à jour le tableau local pour garder l'ordre en mémoire
                            allCategories.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
                        } catch (e) {
                            console.error("Erreur de sauvegarde de l'ordre", e);
                        }
                    }
                });
            }
        }`;
        
        adminContent = adminContent.substring(0, startIdx) + newRender + adminContent.substring(endIdx + 1);
        fs.writeFileSync('public/admin.html', adminContent, 'utf8');
        console.log("✅ admin.html : Système de glisser-déposer activé.");
    }
}
