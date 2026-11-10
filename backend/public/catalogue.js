function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ==========================================
// CATALOGUE.JS - GESTION DU CATALOGUE CLIENT
// ==========================================

// 1. Affichage de la grille des catégories
function renderCatalogueGrid() {
    const container = document.getElementById('product-list');
    if (!container) return;

    if (!allCategories || allCategories.length === 0) {
        container.innerHTML = '<div class="text-center py-12 glass-panel rounded-2xl col-span-full"><h3 class="font-space font-bold text-lg text-white mb-2">Aucune catégorie</h3><p class="text-gray-400 text-sm">La galaxie est en cours de préparation.</p></div>';
        return;
    }

    let html = '';
    allCategories.forEach(cat => {
        const catFlavors = allFlavors.filter(f => f.categorie_id === cat.id);
        const catImg = cat.image_url || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23151028"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="40">📦</text></svg>';
        
        const prixU = cat.prix_unite ? parseFloat(cat.prix_unite).toFixed(2) : '0.00';
        const prix5 = cat.prix_lot_5 ? parseFloat(cat.prix_lot_5).toFixed(2) : null;
        const prix10 = cat.prix_lot_10 ? parseFloat(cat.prix_lot_10).toFixed(2) : null;

        html += `
        <div onclick="openCategoryDrawer(${cat.id})" class="group relative bg-space-surface rounded-2xl border border-white/10 hover:border-nebula-cyan/50 transition-all duration-300 cursor-pointer overflow-hidden shadow-lg hover:shadow-[0_0_20px_rgba(76,201,240,0.2)]">
            <div class="p-4 flex gap-4 items-center relative z-10">
                <div class="w-20 h-20 md:w-24 md:h-24 rounded-xl overflow-hidden flex-shrink-0 border border-white/10 bg-black/50 group-hover:scale-105 transition-transform duration-300">
                    <img src="${catImg}" class="w-full h-full object-cover" alt="${cat.nom}">
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start mb-1">
                        <h3 class="text-lg md:text-xl font-space font-bold text-white truncate pr-2 group-hover:text-nebula-cyan transition-colors">${cat.nom}</h3>
                        <span class="bg-nebula-violet/30 text-nebula-cyan border border-nebula-violet/50 px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0">
                            ${catFlavors.length} PRODUITS
                        </span>
                    </div>
                    <div class="text-sm text-gray-400 mb-2 flex items-center gap-2">
                        <span class="text-white font-bold text-base">U: ${prixU}€</span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        ${prix5 ? `<div class="flex items-center gap-1.5 px-2 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-[10px] font-bold text-cyan-400"><i data-lucide="package" class="w-3 h-3"></i><span>LOT 5: ${prix5}€</span></div>` : ''}
                        ${prix10 ? `<div class="flex items-center gap-1.5 px-2 py-1 bg-pink-500/10 border border-pink-500/30 rounded-lg text-[10px] font-bold text-pink-400"><i data-lucide="package" class="w-3 h-3"></i><span>LOT 10: ${prix10}€</span></div>` : ''}
                    </div>
                </div>
                <div class="hidden sm:flex w-8 h-8 rounded-full bg-white/5 items-center justify-center flex-shrink-0 group-hover:bg-nebula-cyan/20 transition-colors">
                    <i data-lucide="chevron-right" class="w-4 h-4 text-gray-400 group-hover:text-nebula-cyan"></i>
                </div>
            </div>
        </div>`;
    });

    container.innerHTML = html;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// 2. Ouverture du Drawer
function openCategoryDrawer(categoryId) {
    const cat = allCategories.find(c => c.id === categoryId);
    if (!cat) return;

    const catFlavors = allFlavors.filter(f => f.categorie_id === cat.id);

    document.getElementById('drawerCategoryTitle').textContent = cat.nom;
    document.getElementById('drawerCategoryImage').src = cat.image_url || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23151028"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="40">📦</text></svg>';
    document.getElementById('drawerCategoryCount').textContent = catFlavors.length + ' produit' + (catFlavors.length > 1 ? 's' : '') + ' disponible' + (catFlavors.length > 1 ? 's' : '');
    document.getElementById('drawerCategoryDesc').textContent = 'U: ' + parseFloat(cat.prix_unite).toFixed(2) + '€' + (cat.prix_lot_5 ? ' | Lot 5: ' + parseFloat(cat.prix_lot_5).toFixed(2) + '€' : '') + (cat.prix_lot_10 ? ' | Lot 10: ' + parseFloat(cat.prix_lot_10).toFixed(2) + '€' : '');

    const list = document.getElementById('flavorsList');
    if (catFlavors.length === 0) {
        list.innerHTML = '<p class="text-sm text-gray-500 italic text-center py-4">Aucune saveur disponible pour le moment.</p>';
    } else {
        list.innerHTML = catFlavors.map(f => {
            const isOut = f.stock === 0;
            const isLow = f.stock < 2 && f.stock > 0;
            const stockBadge = isOut 
                ? '<span class="text-[9px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded border border-red-500/30">RUPTURE</span>'
                : (isLow 
                    ? '<span class="text-[9px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded border border-orange-500/30">STOCK: ' + f.stock + '</span>'
                    : '<span class="text-[9px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded border border-green-500/30">STOCK: ' + f.stock + '</span>');
            
            return `
            <div class="flex items-center justify-between p-3 rounded-xl bg-space-surface border border-nebula-violet/20 hover:border-nebula-cyan/50 transition-all">
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 mb-1">
                        <h5 class="text-sm font-medium text-white truncate">${typeof escapeHTML === 'function' ? escapeHTML(f.nom) : f.nom}</h5>
                        ${stockBadge}
                    </div>
                    <span class="text-xs text-nebula-cyan font-semibold">${parseFloat(cat.prix_unite).toFixed(2)}€</span>
                </div>
                <button onclick="event.stopPropagation(); if(typeof addToCart === 'function') addToCart(${f.id})" 
                        class="w-8 h-8 ml-2 rounded-lg bg-nebula-violet/20 border border-nebula-violet text-nebula-cyan hover:bg-nebula-magenta hover:border-nebula-magenta hover:text-white flex items-center justify-center font-bold text-lg transition-colors ${isOut ? 'opacity-50 cursor-not-allowed' : ''}"
                        ${isOut ? 'disabled' : ''}>
                    +
                </button>
            </div>`;
        }).join('');
    }

    document.getElementById('categoryDrawer').classList.remove('translate-x-full');
    document.getElementById('drawerBackdrop').classList.remove('opacity-0', 'pointer-events-none');
    document.body.classList.add('overflow-hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeCategoryDrawer() {
    document.getElementById('categoryDrawer').classList.add('translate-x-full');
    document.getElementById('drawerBackdrop').classList.add('opacity-0', 'pointer-events-none');
    document.body.classList.remove('overflow-hidden');
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCategoryDrawer();
});