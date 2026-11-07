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

function showLoginForm() { document.getElementById('step-choice').style.display = 'none'; document.getElementById('step-phone').style.display = 'block'; document.getElementById('step-info').style.display = 'none'; }
function showRegisterForm() { document.getElementById('step-choice').style.display = 'none'; document.getElementById('step-phone').style.display = 'none'; document.getElementById('step-info').style.display = 'block'; }
function backToChoice() { document.getElementById('step-choice').style.display = 'block'; document.getElementById('step-phone').style.display = 'none'; document.getElementById('step-info').style.display = 'none'; }

async function checkPhone() {
    const phone = document.getElementById('phone-input').value;
    if(!phone || phone.length < 8) return alert('Num\u00e9ro invalide');
    try {
        const res = await fetch(`${API_URL}/clients/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telephone: phone }) });
        if (res.ok) { const data = await res.json(); currentUser = data.client; localStorage.setItem('puff_client', JSON.stringify(currentUser)); document.getElementById('login-modal').style.display = 'none'; updateGreeting(); }
        else { alert('Num\u00e9ro non reconnu.'); showRegisterForm(); document.getElementById('phone-input-reg').value = phone; }
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
        if(data.success) { currentUser = data.client; localStorage.setItem('puff_client', JSON.stringify(currentUser)); document.getElementById('login-modal').style.display = 'none'; updateGreeting(); alert('Compte cr\u00e9\u00e9 !'); }
    } catch(e) { alert('Erreur.'); }
}

function updateGreeting() { const el = document.getElementById('user-greeting'); if(el && currentUser) el.innerHTML = `👋 ${currentUser.nom}`; }
function logout() { localStorage.removeItem('puff_client'); location.reload(); }

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
    try {
        const sched = await fetch(`${API_URL}/settings/order-window`).then(r => r.json());
        if (!sched.isOpen) {
            return alert(`⚠️ Les commandes sont fermées.\n\nNos horaires : ${sched.start} à ${sched.end}.\nRevenez pendant ces heures pour valider votre panier !`);
        }
    } catch(e) {} // CLIENT_SCHEDULE_PATCH_V1

    if(!currentUser || !currentUser.id) return alert("Connectez-vous.");
    if(cart.length === 0) return alert('Panier vide');
    if(!selectedZone) return alert('Veuillez choisir une zone.');
    
    const totalOriginal = cart.reduce((sum, item) => sum + (item.prix * item.qty), 0);
    const promoCode = window.appliedPromoCode || null;
    const zoneNom = selectedZone ? selectedZone.nom : null;
    const btn = document.getElementById('checkout-btn'); btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/commandes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: currentUser.id, cart: cart, total: totalOriginal, promo_code: promoCode, valide_par: currentUser.nom, zone: zoneNom }) });
        const data = await res.json();
        if(res.ok && data.success) {
            alert('\u2705 Commande envoy\u00e9e avec succ\u00e8s !');
            cart = []; window.appliedPromoCode = null; window.appliedPromoPct = 0;
            if(document.getElementById('promo-input')) document.getElementById('promo-input').value = '';
            if(document.getElementById('promo-msg')) document.getElementById('promo-msg').textContent = '';
            updateCartUI(); toggleCart(); window.location.reload(); 
        } else { alert('Erreur : ' + (data.error || 'inconnue')); btn.disabled = false; }
    } catch(e) { alert('Erreur de connexion.'); btn.disabled = false; }
}
// CLIENT_SCHEDULE_PATCH_V1


// ===== TIMER_AVIS_JS_PATCH - BEGIN =====

// --- 1. LOGIQUE DU TIMER COSMIQUE ---
let timerInterval = null;
async function initCosmicTimer() {
    const clockEl = document.getElementById('timer-clock');
    const labelEl = document.getElementById('timer-label');
    if(!clockEl || !labelEl) return;

    let data = { start: '22:00', end: '06:00', isOpen: false };

    try {
        const res = await fetch(`${API_URL}/settings/order-window`);
        if (res.ok) {
            const json = await res.json();
            if (json.start) data = json;
        }
    } catch(e) { console.warn("Impossible de charger les horaires, valeurs par défaut utilisées."); }
    
    if (timerInterval) clearInterval(timerInterval);

    function updateClock() {
        const now = new Date();
        const nowBrussels = new Date(now.toLocaleString("en-US", {timeZone: "Europe/Brussels"}));
        
        let targetTime = new Date(nowBrussels);
        let isOpen = data.isOpen;

        const [startH, startM] = data.start.split(':').map(Number);
        const [endH, endM] = data.end.split(':').map(Number);

        if (isOpen) {
            labelEl.textContent = "Fermeture dans";
            targetTime.setHours(endH, endM, 0, 0);
            if (targetTime <= nowBrussels) targetTime.setDate(targetTime.getDate() + 1);
        } else {
            labelEl.textContent = "Ouverture dans";
            targetTime.setHours(startH, startM, 0, 0);
            if (targetTime <= nowBrussels) targetTime.setDate(targetTime.getDate() + 1);
        }

        const diff = targetTime - nowBrussels;
        if (diff <= 0) {
            clockEl.textContent = "00:00:00";
            return; 
        }

        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);

        clockEl.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    updateClock();
    timerInterval = setInterval(updateClock, 1000);
    setTimeout(initCosmicTimer, 60000); 
}

// --- 2. LOGIQUE DES AVIS ANONYMES ---
let selectedNote = 0;
const starSpans = document.querySelectorAll('#star-rating span');
if (starSpans.length > 0) {
    starSpans.forEach(star => {
        star.addEventListener('click', () => {
            selectedNote = parseInt(star.getAttribute('data-val'));
            starSpans.forEach(s => {
                if (parseInt(s.getAttribute('data-val')) <= selectedNote) {
                    s.classList.remove('text-gray-500');
                    s.classList.add('text-yellow-400');
                } else {
                    s.classList.add('text-gray-500');
                    s.classList.remove('text-yellow-400');
                }
            });
        });
    });
}

async function submitAvis() {
    const text = document.getElementById('avis-text').value.trim();
    if (selectedNote === 0) return alert("Veuillez sélectionner une note (étoiles).");
    if (!text) return alert("Veuillez écrire un commentaire.");
    
    try {
        const res = await fetch(`${API_URL}/avis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: selectedNote, commentaire: text })
        });
        const data = await res.json();
        if(data.success) {
            alert(data.message);
            document.getElementById('avis-text').value = '';
            selectedNote = 0;
            starSpans.forEach(s => { s.classList.add('text-gray-500'); s.classList.remove('text-yellow-400'); });
        }
    } catch(e) { alert("Erreur réseau."); }
}

async function loadPublicAvis() {
    const container = document.getElementById('avis-display');
    if(!container) return;
    try {
        const res = await fetch(`${API_URL}/avis/approuves`);
        const avis = await res.json();
        if(avis.length === 0) { container.innerHTML = '<p class="text-center text-gray-500 italic">Soyez le premier à laisser un avis !</p>'; return; }
        
        container.innerHTML = avis.map(a => {
            const stars = '★'.repeat(a.note) + '☆'.repeat(5 - a.note);
            return `
            <div class="glass-panel p-4 rounded-xl">
                <div class="text-yellow-400 text-lg mb-1">${stars}</div>
                <p class="text-gray-300 text-sm italic mb-2">"${a.commentaire}"</p>
                <div class="text-xs text-gray-500 text-right">- Client Anonyme</div>
            </div>`;
        }).join('');
    } catch(e) { container.innerHTML = 'Erreur de chargement des avis.'; }
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    initCosmicTimer();
    loadPublicAvis();
});
// ===== TIMER_AVIS_JS_PATCH - END =====

