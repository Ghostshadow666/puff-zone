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
    loadPromos();
    loadCatalogue();
    loadZones();
});

async function loadPromos() {
    try {
        const res = await fetch(`${API_URL}/promo/public`);
        const promos = await res.json();
        const marquee = document.getElementById('promo-marquee');
        if (marquee && promos.length > 0) {
            let html = '';
            for(let i=0; i<10; i++) {
                promos.forEach(p => { html += `<span class="flex items-center gap-1.5"><i data-lucide="tag" class="w-3.5 h-3.5 text-nebula-cyan"></i> CODE : ${p.code} (-${p.pourcentage}%)</span>`; });
            }
            marquee.innerHTML = html;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
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

// --- NOUVEAU RENDU : ACCORDÉON PAR CATÉGORIE ---
function renderCatalogue() {
    const container = document.getElementById('product-list');
    if(!container) return;

    if (allCategories.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 glass-panel rounded-2xl">
                <i data-lucide="package-search" class="w-12 h-12 text-gray-500 mx-auto mb-4"></i>
                <h3 class="font-space font-bold text-lg text-white mb-2">Aucune catégorie</h3>
                <p class="text-gray-400 text-sm">La galaxie est en cours de préparation.</p>
            </div>`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    let html = '';
    allCategories.forEach(cat => {
        const catFlavors = allFlavors.filter(f => f.categorie_id === cat.id);
        
        // Génération des cartes compactes pour cette catégorie
        let cardsHtml = '';
        catFlavors.forEach(f => {
            const isOut = f.stock <= 0;
            const img = cat.image_url || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23151028"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="40">💨</text></svg>';
            
            cardsHtml += `
            <div class="bg-space-bg/40 border border-white/5 rounded-xl p-3 flex flex-col justify-between group hover:border-nebula-cyan/50 transition-all">
                <div>
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-[9px] font-bold px-2 py-0.5 rounded bg-nebula-violet/20 text-nebula-cyan truncate max-w-[80px]">${f.nom}</span>
                        <span class="text-[9px] font-bold ${isOut ? 'text-red-400' : 'text-green-400'}">${isOut ? 'RUPTURE' : 'STK: '+f.stock}</span>
                    </div>
                    <div class="h-24 mb-2 flex items-center justify-center">
                         <img src="${img}" class="w-full h-full object-cover rounded-lg group-hover:scale-105 transition-transform">
                    </div>
                </div>
                <div class="flex justify-between items-center border-t border-white/5 pt-2 mt-2">
                    <span class="font-bold text-white text-sm">${parseFloat(cat.prix_unite).toFixed(2)}€</span>
                    ${isOut 
                        ? `<button disabled class="px-2 py-1 rounded bg-gray-800 text-gray-500 text-[10px] cursor-not-allowed">&times;</button>`
                        : `<button onclick="addToCart(${f.id})" class="px-2 py-1 rounded bg-gradient-to-r from-nebula-violet to-nebula-magenta text-white text-[10px] font-bold shadow-lg hover:opacity-90"><i data-lucide="plus" class="w-3 h-3"></i></button>`
                    }
                </div>
            </div>`;
        });

        // Bloc Accordéon
        html += `
        <div class="glass-panel rounded-2xl overflow-hidden border border-white/10 mb-4">
            <div class="flex justify-between items-center p-4 cursor-pointer hover:bg-white/5 transition-colors" onclick="toggleCategory(${cat.id})">
                <h3 class="font-space font-bold text-lg text-white flex items-center gap-3">
                    ${cat.nom}
                    <span class="text-xs font-normal bg-nebula-violet/20 text-nebula-cyan px-2 py-0.5 rounded-full border border-nebula-violet/30">${catFlavors.length} produit${catFlavors.length > 1 ? 's' : ''}</span>
                </h3>
                <i data-lucide="chevron-down" id="arrow-${cat.id}" class="text-nebula-cyan transition-transform duration-300"></i>
            </div>
            <div id="cat-grid-${cat.id}" class="p-4 border-t border-white/10">
                ${catFlavors.length > 0 
                    ? `<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">${cardsHtml}</div>`
                    : `<div class="text-center text-gray-500 text-sm italic py-4">Bientôt disponible...</div>`
                }
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

// --- PANIER (Inchangé) ---
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
        cart.push({ id: flav.id, nom: flav.nom, categorie: cat.nom, prix: cat.prix_unite, qty: 1 }); 
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
        total += item.prix * item.qty;
        html += `
        <div class="flex items-center justify-between p-3 rounded-xl bg-space-surface/60 border border-white/10 gap-3">
            <div>
                <h4 class="font-space font-bold text-xs text-white">${item.nom}</h4>
                <p class="text-[10px] text-gray-400">${item.categorie}</p>
                <span class="text-xs font-bold text-nebula-cyan">${(item.prix * item.qty).toFixed(2)} €</span>
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

function toggleCart() { 
    const drawer = document.getElementById('cart-drawer');
    const panel = document.getElementById('cart-panel');
    if (drawer.classList.contains('pointer-events-none')) {
        drawer.classList.remove('pointer-events-none', 'opacity-0');
        drawer.classList.add('opacity-100');
        panel.classList.remove('translate-x-full');
    } else {
        panel.classList.add('translate-x-full');
        drawer.classList.remove('opacity-100');
        drawer.classList.add('opacity-0', 'pointer-events-none');
    }
}

// --- CONNEXION / INSCRIPTION ---
function showLoginForm() { document.getElementById('step-choice').style.display = 'none'; document.getElementById('step-phone').style.display = 'block'; document.getElementById('step-info').style.display = 'none'; }
function showRegisterForm() { document.getElementById('step-choice').style.display = 'none'; document.getElementById('step-phone').style.display = 'none'; document.getElementById('step-info').style.display = 'block'; }
function backToChoice() { document.getElementById('step-choice').style.display = 'block'; document.getElementById('step-phone').style.display = 'none'; document.getElementById('step-info').style.display = 'none'; }

async function checkPhone() {
    const phone = document.getElementById('phone-input').value;
    if(!phone || phone.length < 8) return alert('Numéro invalide');
    try {
        const res = await fetch(`${API_URL}/clients/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telephone: phone }) });
        if (res.ok) { const data = await res.json(); currentUser = data.client; localStorage.setItem('puff_client', JSON.stringify(currentUser)); document.getElementById('login-modal').style.display = 'none'; updateGreeting(); }
        else { alert('Numéro non reconnu.'); showRegisterForm(); document.getElementById('phone-input-reg').value = phone; }
    } catch(e) { alert('Erreur serveur.'); }
}

async function saveProfile() {
    const phone = document.getElementById('phone-input-reg').value;
    const nom = document.getElementById('name-input').value;
    const adresse = document.getElementById('address-input').value;
    const whatsapp = document.getElementById('whatsapp-input').value;
    if(!phone || !nom || !adresse) return alert('Remplissez les champs.');
    try {
        const res = await fetch(`${API_URL}/clients/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telephone: phone, nom, adresse, whatsapp }) });
        const data = await res.json();
        if(data.success) { currentUser = data.client; localStorage.setItem('puff_client', JSON.stringify(currentUser)); document.getElementById('login-modal').style.display = 'none'; updateGreeting(); alert('Compte créé !'); }
    } catch(e) { alert('Erreur.'); }
}

function updateGreeting() { const el = document.getElementById('user-greeting'); if(el && currentUser) el.innerHTML = `👋 ${currentUser.nom}`; }
function logout() { localStorage.removeItem('puff_client'); location.reload(); }

// --- ZONES & PROMOS ---
async function loadZones() { 
    try { const res = await fetch(`${API_URL}/zones`); allZones = await res.json(); const select = document.getElementById('zone-select'); if(select) { select.innerHTML = '<option value="">-- Choisir votre zone --</option>' + allZones.map(z => `<option value="${z.id}">${z.nom} (Min: ${z.min_commande}€)</option>`).join(''); } } catch (e) { console.error(e); } 
}

function applyZone() { const zoneId = document.getElementById('zone-select').value; selectedZone = allZones.find(z => z.id == zoneId) || null; updateCartUI(); }

async function applyPromo() {
    const code = document.getElementById('promo-input').value.trim();
    const msg = document.getElementById('promo-msg');
    if (!code) { msg.textContent = "Entrez un code."; return; }
    msg.textContent = "Vérification..."; msg.style.color = "#aaa";
    try {
        const res = await fetch(`${API_URL}/promo/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) });
        const data = await res.json();
        if (data.success) {
            window.appliedPromoCode = code; window.appliedPromoPct = data.pourcentage;
            msg.innerHTML = `✅ Code appliqué : -${data.pourcentage}%`; msg.style.color = "#22C55E";
            if (typeof updateCartUI === "function") updateCartUI();
        } else {
            window.appliedPromoCode = null; window.appliedPromoPct = 0;
            msg.innerHTML = `❌ ${data.error || 'Code invalide'}`; msg.style.color = "#EF4444";
            if (typeof updateCartUI === "function") updateCartUI();
        }
    } catch (e) { msg.textContent = "Erreur"; }
}

async function checkout() {
    if(!currentUser || !currentUser.id) return alert("Connectez-vous.");
    if(cart.length === 0) return alert('Panier vide');
    if(!selectedZone) return alert('Veuillez choisir une zone.');
    
    const totalOriginal = cart.reduce((sum, item) => sum + (item.prix * item.qty), 0);
    const promoCode = window.appliedPromoCode || null;
    const btn = document.getElementById('checkout-btn'); btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/commandes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: currentUser.id, cart: cart, total: totalOriginal, promo_code: promoCode, valide_par: currentUser.nom }) });
        const data = await res.json();
        if(res.ok && data.success) {
            alert('✅ Commande envoyée avec succès !');
            cart = []; window.appliedPromoCode = null; window.appliedPromoPct = 0;
            if(document.getElementById('promo-input')) document.getElementById('promo-input').value = '';
            if(document.getElementById('promo-msg')) document.getElementById('promo-msg').textContent = '';
            updateCartUI(); toggleCart(); window.location.reload(); 
        } else { alert('Erreur : ' + (data.error || 'inconnue')); btn.disabled = false; }
    } catch(e) { alert('Erreur de connexion.'); btn.disabled = false; }
}