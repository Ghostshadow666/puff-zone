const API_URL = '/api';
let allCategories = [];
let allFlavors = [];
let allZones = [];
let cart = [];
let currentUser = JSON.parse(localStorage.getItem('puff_client')) || null;
let selectedZone = null;

document.addEventListener('DOMContentLoaded', () => {
    if (currentUser) {
        document.getElementById('login-modal').style.display = 'none';
        updateGreeting();
    } else {
        document.getElementById('login-modal').style.display = 'flex';
    }
    loadSettings();
    loadPromos();
    loadCatalogue();
    loadZones();
});

async function loadSettings() {
    try {
        const res = await fetch(`${API_URL}/settings`);
        const data = await res.json();
        const marquee = document.getElementById('promo-marquee');
        if (marquee && data.banner_text) {
            // On duplique le texte pour un dÃ©filement infini fluide
            let html = '';
            for(let i=0; i<8; i++) {
                html += `<span class="flex items-center gap-2 mx-4"><i data-lucide="sparkles" class="w-4 h-4 text-nebula-cyan"></i> ${data.banner_text}</span>`;
            }
            marquee.innerHTML = html;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    } catch(e) { console.error("Erreur settings", e); }
}

async function loadPromos() {
    try {
        const res = await fetch(`${API_URL}/promo/public`);
        const promos = await res.json();
        // Les promos peuvent Ãªtre ajoutÃ©es au bandeau plus tard si besoin, 
        // pour l'instant on gÃ¨re uniquement le texte personnalisÃ©.
    } catch(e) { console.error(e); }
}

async function loadCatalogue() {
    try {
        const res = await fetch(`${API_URL}/catalogue`);
        const data = await res.json();
        allCategories = data.categories || [];
        allFlavors = data.saveurs || [];
        renderCatalogue();
    } catch (e) { 
        const pl = document.getElementById('product-list');
        if(pl) pl.innerHTML = '<p class="text-red-500 text-center">Erreur de chargement.</p>'; 
    }
}

function renderCatalogue() {
    const container = document.getElementById('product-list');
    if(!container) return;

    if (allCategories.length === 0) {
        container.innerHTML = `<div class="text-center py-12 glass-panel rounded-2xl"><h3 class="font-space font-bold text-lg text-white mb-2">Aucune catégorie</h3><p class="text-gray-400 text-sm">La galaxie est en cours de préparation.</p></div>`;
        return;
    }

    let html = '';
    allCategories.forEach(cat => {
        const catFlavors = allFlavors.filter(f => f.categorie_id === cat.id);
        const catImg = cat.image_url || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23151028"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="40">📦</text></svg>';

        let cardsHtml = '';
        catFlavors.forEach(f => {
            const isOut = f.stock <= 0;
            cardsHtml += `
            <div class="bg-space-surface/80 border border-white/10 rounded-xl p-2.5 flex flex-col justify-between group hover:border-nebula-cyan/50 transition-all">
                <div class="flex justify-between items-start mb-1">
                    <span class="text-[10px] font-bold text-white truncate max-w-[90px]">${f.nom}</span>
                    <span class="text-[9px] font-bold ${isOut ? 'text-red-400' : 'text-green-400'}">${isOut ? 'RUPTURE' : 'STK:'+f.stock}</span>
                </div>
                <div class="flex justify-between items-center mt-2">
                    <span class="font-bold text-nebula-cyan text-xs">${parseFloat(cat.prix_unite).toFixed(2)}€</span>
                    ${isOut ? `<button disabled class="px-2 py-1 rounded bg-gray-800 text-gray-500 text-[10px] cursor-not-allowed">&times;</button>` : `<button onclick="addToCart(${f.id})" class="px-2 py-1 rounded-lg bg-gradient-to-r from-nebula-violet to-nebula-magenta text-white shadow-lg hover:opacity-90 flex items-center justify-center transition-transform hover:scale-105"><i data-lucide="plus" class="w-3.5 h-3.5"></i></button>`}
                </div>
            </div>`;
        });

        // Génération des badges de prix (U, Lot 5, Lot 10)
        let pricesHtml = `<div class="flex gap-2 mt-2 flex-wrap">
            <span class="text-[10px] font-bold text-white bg-black/40 px-2 py-0.5 rounded">U: ${cat.prix_unite}€</span>`;
        if (cat.prix_lot_5) pricesHtml += `<span class="text-[10px] font-bold text-nebula-cyan bg-nebula-cyan/10 px-2 py-0.5 rounded border border-nebula-cyan/30">Lot 5: ${cat.prix_lot_5}€</span>`;
        if (cat.prix_lot_10) pricesHtml += `<span class="text-[10px] font-bold text-nebula-magenta bg-nebula-magenta/10 px-2 py-0.5 rounded border border-nebula-magenta/30">Lot 10: ${cat.prix_lot_10}€</span>`;
        pricesHtml += `</div>`;

        // On génère la catégorie avec la classe 'hidden' par défaut
        html += `
        <div class="glass-panel rounded-2xl overflow-hidden border border-white/10 mb-4">
            <div class="flex justify-between items-center p-4 cursor-pointer hover:bg-white/5 transition-colors" onclick="toggleCategory(${cat.id})">
                <div class="flex items-center gap-4">
                    <img src="${catImg}" class="w-12 h-12 object-cover rounded-lg border border-white/10">
                    <div>
                        <h3 class="font-space font-bold text-lg text-white flex items-center gap-3">
                            ${cat.nom}
                            <span class="text-xs font-normal bg-nebula-violet/20 text-nebula-cyan px-2 py-0.5 rounded-full border border-nebula-violet/30">${catFlavors.length} produit${catFlavors.length > 1 ? 's' : ''}</span>
                        </h3>
                        ${pricesHtml}
                    </div>
                </div>
                <i data-lucide="chevron-down" id="arrow-${cat.id}" class="text-nebula-cyan transition-transform duration-300" style="transform: rotate(-90deg);"></i>
            </div>
            <div id="cat-grid-${cat.id}" class="p-4 border-t border-white/10 hidden">
                ${catFlavors.length > 0 ? `<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">${cardsHtml}</div>` : `<div class="text-center text-gray-500 text-sm italic py-4">Bientôt disponible...</div>`}
            </div>
        </div>`;
    });

    container.innerHTML = html;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function toggleCategory(catId) {
    const grid = document.getElementById(`cat-grid-${catId}`);
    const arrow = document.getElementById(`arrow-${catId}`);
    if (grid.classList.contains('hidden')) {
        grid.classList.remove('hidden');
        arrow.style.transform = 'rotate(0deg)';
    } else {
        grid.classList.add('hidden');
        arrow.style.transform = 'rotate(-90deg)';
    }
}

function addToCart(flavId) {
    if(!currentUser) { document.getElementById('login-modal').style.display = 'flex'; return; }
    const flav = allFlavors.find(f => f.id === flavId);
    if (!flav || flav.stock <= 0) return;
    const cat = allCategories.find(c => c.id === flav.categorie_id);
    const existing = cart.find(item => item.id === flavId);
    
    if(existing) { 
        if (existing.qty >= flav.stock) { alert(`Stock max atteint (${flav.stock} dispo).`); return; }
        existing.qty++; 
    } else { 
        cart.push({ id: flav.id, nom: flav.nom, categorie: cat.nom, prix: cat.prix_unite, prix_lot_5: cat.prix_lot_5, prix_lot_10: cat.prix_lot_10, qty: 1 }); 
    }
    updateCartUI(); toggleCart();
}

function updateQty(index, change) {
    const item = cart[index];
    const flav = allFlavors.find(f => f.id === item.id);
    if (change > 0) {
        if (flav && item.qty >= flav.stock) { alert(`Stock max atteint.`); return; }
        item.qty++;
    } else { item.qty--; if (item.qty <= 0) cart.splice(index, 1); }
    updateCartUI();
}


function calculerPrixItem(item) {
    let qty = item.qty;
    let total = 0;
    let detail = [];

    const p1 = parseFloat(item.prix);
    const p5 = item.prix_lot_5 ? parseFloat(item.prix_lot_5) : null;
    const p10 = item.prix_lot_10 ? parseFloat(item.prix_lot_10) : null;

    // Calcul des lots de 10
    if (p10 && qty >= 10) {
        let nbLots10 = Math.floor(qty / 10);
        total += nbLots10 * p10;
        detail.push(`${nbLots10}x Lot10 (${p10}€)`);
        qty = qty % 10;
    }
    // Calcul des lots de 5
    if (p5 && qty >= 5) {
        let nbLots5 = Math.floor(qty / 5);
        total += nbLots5 * p5;
        detail.push(`${nbLots5}x Lot5 (${p5}€)`);
        qty = qty % 5;
    }
    // Calcul du reste à l'unité
    if (qty > 0) {
        total += qty * p1;
        detail.push(`${qty}x Unité (${p1}€)`);
    }

    return { total, detail: detail.join(' + ') };
}


    fetch(`${API_URL}/settings/order-window`).then(r => r.json()).then(sched => {
        const bannerId = 'closed-banner';
        let banner = document.getElementById(bannerId);
        if (!sched.isOpen) {
            if (!banner) {
                banner = document.createElement('div');
                banner.id = bannerId;
                banner.className = 'bg-red-500/20 border border-red-500/50 text-red-400 text-xs text-center p-2 rounded-lg mb-2 font-bold animate-pulse';
                banner.innerHTML = `🔒 Commandes fermées. Ouverture à ${sched.start}`;
                const cartItems = document.getElementById('cart-items');
                if (cartItems) cartItems.parentNode.insertBefore(banner, cartItems);
            }
        } else {
            if (banner) banner.remove();
        }
    }).catch(()=>{});

function updateCartUI() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0); 
    const cc = document.getElementById('cart-count');
    if(cc) cc.textContent = count;
    
    const itemsContainer = document.getElementById('cart-items');
    if(!itemsContainer) return;
    
    if(cart.length === 0) { 
        itemsContainer.innerHTML = '<div class="text-center py-12 text-gray-500 text-xs">Votre panier spatial est vide.</div>'; 
        document.getElementById('cart-total-price').innerHTML = '0.00 €'; 
        window.appliedPromoCode = null; window.appliedPromoPct = 0;
        if(document.getElementById('promo-input')) document.getElementById('promo-input').value = '';
        if(document.getElementById('promo-msg')) document.getElementById('promo-msg').textContent = '';
        const cb = document.getElementById('checkout-btn');
        if(cb) { cb.disabled = true; cb.style.opacity = '0.5'; }
        return; 
    }
    
    let html = ''; let total = 0;
    cart.forEach((item, index) => {
        const calc = calculerPrixItem(item);
        total += calc.total;
        html += `
        <div class="flex items-center justify-between p-3 rounded-xl bg-space-surface/60 border border-white/10 gap-3">
            <div>
                <h4 class="font-space font-bold text-xs text-white">${item.nom}</h4>
                <p class="text-[10px] text-gray-400">${item.categorie}</p>
                <span class="text-xs font-bold text-nebula-cyan" title="${calc.detail}">${calc.total.toFixed(2)} €</span>
            </div>
            <div class="flex items-center gap-2 bg-space-bg p-1 rounded-lg border border-white/10">
                <button onclick="updateQty(${index}, -1)" class="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white font-bold">-</button>
                <span class="text-xs font-bold text-white px-1">${item.qty}</span>
                <button onclick="updateQty(${index}, 1)" class="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white font-bold">+</button>
            </div>
        </div>`;
    });
    itemsContainer.innerHTML = html; 
    
    let finalTotal = total;
    if (window.appliedPromoPct > 0) { finalTotal = total - (total * (window.appliedPromoPct / 100)); }
    const ctp = document.getElementById('cart-total-price');
    if(ctp) ctp.innerHTML = finalTotal.toFixed(2) + ' €';

    const checkoutBtn = document.getElementById('checkout-btn'); 
    const zoneMsg = document.getElementById('zone-msg');
    
    if(checkoutBtn) {
        if (!selectedZone) {
            checkoutBtn.disabled = true; checkoutBtn.style.opacity = '0.5';
            if(zoneMsg) { zoneMsg.innerHTML = "⚠️ Choisissez votre zone."; }
        } else if (total < selectedZone.min_commande) {
            checkoutBtn.disabled = true; checkoutBtn.style.opacity = '0.5';
            if(zoneMsg) { zoneMsg.innerHTML = `⚠️ Min. ${selectedZone.min_commande}€ pour ${selectedZone.nom}.`; }
        } else {
            checkoutBtn.disabled = false; checkoutBtn.style.opacity = '1';
            if(zoneMsg) { zoneMsg.innerHTML = ""; }
        }
    }
}

// --- RESTAURATION DES FONCTIONS DE CONNEXION ---
function showLoginForm() {
    const modal = document.getElementById('login-modal');
    if(modal) modal.style.display = 'flex';
}
function hideLoginForm() {
    const modal = document.getElementById('login-modal');
    if(modal) modal.style.display = 'none';
}
function logout() {
    localStorage.removeItem('puff_client');
    location.reload();
}
