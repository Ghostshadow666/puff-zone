// ===== FONCTIONS UTILITAIRES =====
function cleanPhoneForWhatsApp(phone) {
    if (!phone) return '';
    let cleaned = String(phone).replace(/\D/g, '');
    if (cleaned.startsWith('0')) {
        cleaned = '32' + cleaned.substring(1);
    }
    return cleaned;
}

function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const API_URL = '/api';
let allCategories = [];
let allFlavors = [];
let allZones = [];
let cart = [];
let currentUser = JSON.parse(localStorage.getItem('puff_client')) || null;
let selectedZone = null;
let modeLivraison = 'livraison';

// ===== INITIALISATION =====
document.addEventListener('DOMContentLoaded', () => {
    // Forcer le chargement de la promo
    setTimeout(loadActivePromo, 1000);
    // On vérifie que l'élément existe avant d'agir (évite les crashs)
    const loginModal = document.getElementById('login-modal');
    if (currentUser) {
        if (loginModal) loginModal.style.display = 'none';
        updateGreeting();
    } else {
        if (loginModal) loginModal.style.display = 'flex';
    }
    
    loadSettings();
    loadPromos();
    loadCatalogue();
    loadZones();
    loadSondage();
});

// ===== CHARGEMENT DES DONNÉES =====

// ===== AFFICHAGE PUB PROMO =====
async function loadActivePromo() {
    try {
        const res = await fetch(`${API_URL}/promo/public`);
        const promos = await res.json();
        
        // On cherche la dernière promo active avec une image
        const promoWithImage = promos.find(p => p.image_url);
        
        if (promoWithImage) {
            const container = document.getElementById('promo-image-container');
            const img = document.getElementById('promo-image');
            const text = document.getElementById('promo-image-text');
            
            if (container && img && text) {
                img.src = promoWithImage.image_url;
                text.textContent = `-${promoWithImage.pourcentage}% avec le code ${promoWithImage.code}`;
                container.classList.add('active');
            }
        }
    } catch(e) { console.error('Erreur promo:', e); }
}

function openPromoDetails() {
    // Optionnel : ouvrir une modale avec les détails
    // Pour l'instant, on ne fait rien (ou on pourrait rediriger vers le panier)
    const cartBtn = document.getElementById('cart-drawer');
    if (cartBtn) toggleCart();
}
// ===============================

async function loadSettings() {
    try {
        const res = await fetch(`${API_URL}/settings`);
        const data = await res.json();
        const marquee = document.getElementById('promo-marquee');
        if (marquee && data.banner_text) {
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
    } catch(e) { console.error(e); }
}

async function loadCatalogue() {
    try {
        const res = await fetch(`${API_URL}/catalogue`);
        const data = await res.json();
        allCategories = (data.categories || []).filter(c => c.visible_client !== false);
        allFlavors = data.saveurs || [];
        renderCatalogueGrid();
    } catch (e) { 
        const pl = document.getElementById('product-list');
        if(pl) pl.innerHTML = '<p class="text-red-500 text-center">Erreur de chargement.</p>'; 
    }
}

// ===== DRAWER CATEGORIE (dans catalogue.js normalement, mais on garde au cas où) =====
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
                        <h5 class="text-sm font-medium text-white truncate">${escapeHTML(f.nom)}</h5>
                        ${stockBadge}
                    </div>
                    <span class="text-xs text-nebula-cyan font-semibold">${parseFloat(cat.prix_unite).toFixed(2)}€</span>
                </div>
                <button onclick="event.stopPropagation(); addToCart(${f.id})" 
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
}

function closeCategoryDrawer() {
    document.getElementById('categoryDrawer').classList.add('translate-x-full');
    document.getElementById('drawerBackdrop').classList.add('opacity-0', 'pointer-events-none');
    document.body.classList.remove('overflow-hidden');
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCategoryDrawer();
});

// ===== PANIER =====
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
    return { total: item.prix * item.qty, detail: '' };
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
        const promoImg = document.getElementById('promo-image-container');
        if(promoImg) promoImg.classList.add('hidden');
        const cb = document.getElementById('checkout-btn');
        if(cb) { cb.disabled = true; cb.style.opacity = '0.5'; }
        return; 
    }
    
    // --- CALCUL PAR CATÉGORIE (LOTS MIXTES) ---
    const itemsByCategory = {};
    cart.forEach(item => {
        const catName = item.categorie;
        if (!itemsByCategory[catName]) {
            itemsByCategory[catName] = {
                prix_unite: parseFloat(item.prix),
                prix_lot_5: item.prix_lot_5 ? parseFloat(item.prix_lot_5) : null,
                prix_lot_10: item.prix_lot_10 ? parseFloat(item.prix_lot_10) : null,
                total_qty: 0,
                items: []
            };
        }
        itemsByCategory[catName].total_qty += item.qty;
        itemsByCategory[catName].items.push(item);
    });

    let total = 0;
    let detailsHtml = '';

    for (const catName in itemsByCategory) {
        const cat = itemsByCategory[catName];
        let qty = cat.total_qty;
        let catTotal = 0;
        let catDetail = [];

        if (cat.prix_lot_10 && qty >= 10) {
            const nbLots10 = Math.floor(qty / 10);
            catTotal += nbLots10 * cat.prix_lot_10;
            catDetail.push(`${nbLots10}x Lot10 (${cat.prix_lot_10}€)`);
            qty = qty % 10;
        }
        if (cat.prix_lot_5 && qty >= 5) {
            const nbLots5 = Math.floor(qty / 5);
            catTotal += nbLots5 * cat.prix_lot_5;
            catDetail.push(`${nbLots5}x Lot5 (${cat.prix_lot_5}€)`);
            qty = qty % 5;
        }
        if (qty > 0) {
            catTotal += qty * cat.prix_unite;
            catDetail.push(`${qty}x Unité (${cat.prix_unite}€)`);
        }

        total += catTotal;

        detailsHtml += `<div class="mb-3 p-2 bg-black/20 rounded-lg border border-white/5">
            <div class="text-[10px] font-bold text-nebula-cyan uppercase mb-1">${catName}</div>`;
        
        cat.items.forEach(item => {
            const index = cart.indexOf(item);
            detailsHtml += `
            <div class="flex items-center justify-between p-2 rounded-xl bg-space-surface/60 border border-white/10 gap-2 mb-1">
                <div>
                    <h4 class="font-space font-bold text-xs text-white">${item.nom}</h4>
                    <span class="text-xs font-bold text-nebula-cyan">${(item.prix * item.qty).toFixed(2)} €</span>
                </div>
                <div class="flex items-center gap-2 bg-space-bg p-1 rounded-lg border border-white/10">
                    <button onclick="updateQty(${index}, -1)" class="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white font-bold">-</button>
                    <span class="text-xs font-bold text-white px-1">${item.qty}</span>
                    <button onclick="updateQty(${index}, 1)" class="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white font-bold">+</button>
                </div>
            </div>`;
        });

        detailsHtml += `<div class="text-[10px] text-gray-400 text-right mt-1">Total ${catName} : <strong class="text-white">${catTotal.toFixed(2)} €</strong> (${catDetail.join(' + ')})</div></div>`;
    }

    itemsContainer.innerHTML = detailsHtml; 
    
    let finalTotal = total;
    if (window.appliedPromoPct > 0) { 
        if (window.appliedPromoCategorie) {
            // Réduction uniquement sur la catégorie
            let totalCategorie = 0;
            for (const catName in itemsByCategory) {
                const cat = itemsByCategory[catName];
                if (cat.items[0] && allCategories.find(c => c.nom === catName && c.id === window.appliedPromoCategorie)) {
                    let qty = cat.total_qty;
                    if (cat.prix_lot_10 && qty >= 10) { totalCategorie += Math.floor(qty / 10) * cat.prix_lot_10; qty = qty % 10; }
                    if (cat.prix_lot_5 && qty >= 5) { totalCategorie += Math.floor(qty / 5) * cat.prix_lot_5; qty = qty % 5; }
                    if (qty > 0) { totalCategorie += qty * cat.prix_unite; }
                }
            }
            finalTotal = total - (totalCategorie * (window.appliedPromoPct / 100));
        } else {
            finalTotal = total - (total * (window.appliedPromoPct / 100));
        }
    }
    const ctp = document.getElementById('cart-total-price');
    if(ctp) ctp.innerHTML = finalTotal.toFixed(2) + ' €';

    const checkoutBtn = document.getElementById('checkout-btn'); 
    const zoneMsg = document.getElementById('zone-msg');
    
    if(checkoutBtn) {
        // SI RETRAIT : bouton actif, pas besoin de zone
        if (modeLivraison === 'retrait') {
            checkoutBtn.disabled = false;
            checkoutBtn.style.opacity = '1';
            if (zoneMsg) zoneMsg.innerHTML = "🏠 Retrait à domicile (pas de frais).";
        } 
        // SINON : vérification normale de la zone
        else if (!selectedZone) {
            checkoutBtn.disabled = true; 
            checkoutBtn.style.opacity = '0.5';
            if(zoneMsg) { zoneMsg.innerHTML = "⚠️ Choisissez votre zone."; }
        } else if (total < selectedZone.min_commande) {
            checkoutBtn.disabled = true; 
            checkoutBtn.style.opacity = '0.5';
            if(zoneMsg) { zoneMsg.innerHTML = `⚠️ Min. ${selectedZone.min_commande}€ pour ${selectedZone.nom}.`; }
        } else {
            checkoutBtn.disabled = false; 
            checkoutBtn.style.opacity = '1';
            if(zoneMsg) { zoneMsg.innerHTML = ""; }
        }
    }
}


function setModeLivraison(mode) {
    modeLivraison = mode;
    const btnLiv = document.getElementById('btn-livraison');
    const btnRet = document.getElementById('btn-retrait');
    const selectZone = document.getElementById('zone-select');
    
    if (mode === 'livraison') {
        if (btnLiv) btnLiv.className = 'flex-1 py-2 rounded-lg bg-nebula-violet text-white text-xs font-bold transition-all active:scale-95';
        if (btnRet) btnRet.className = 'flex-1 py-2 rounded-lg bg-space-bg border border-white/10 text-gray-400 text-xs font-bold transition-all active:scale-95';
        if (selectZone) selectZone.disabled = false;
    } else {
        if (btnLiv) btnLiv.className = 'flex-1 py-2 rounded-lg bg-space-bg border border-white/10 text-gray-400 text-xs font-bold transition-all active:scale-95';
        if (btnRet) btnRet.className = 'flex-1 py-2 rounded-lg bg-nebula-cyan text-black text-xs font-bold transition-all active:scale-95';
        if (selectZone) selectZone.disabled = true;
        selectedZone = null;
    }
    updateCartUI();
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

// ===== AUTHENTIFICATION =====
function showLoginForm() { 
    document.getElementById('step-choice').style.display = 'none'; 
    document.getElementById('step-phone').style.display = 'block'; 
    document.getElementById('step-info').style.display = 'none'; 
}
function showRegisterForm() { 
    document.getElementById('step-choice').style.display = 'none'; 
    document.getElementById('step-phone').style.display = 'none'; 
    document.getElementById('step-info').style.display = 'block'; 
}
function backToChoice() { 
    document.getElementById('step-choice').style.display = 'block'; 
    document.getElementById('step-phone').style.display = 'none'; 
    document.getElementById('step-info').style.display = 'none'; 
}

async function checkPhone() {
    const phone = document.getElementById('phone-input').value;
    if(!phone || phone.length < 8) return alert('Numéro invalide');
    try {
        const res = await fetch(`${API_URL}/clients/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telephone: phone }) });
        if (res.ok) { 
            const data = await res.json(); 
            currentUser = data.client; 
            localStorage.setItem('puff_client', JSON.stringify(currentUser)); 
            document.getElementById('login-modal').style.display = 'none'; 
            updateGreeting(); 
        }
        else { 
            alert('Numéro non reconnu.'); 
            showRegisterForm(); 
            document.getElementById('whatsapp-input').value = phone; 
        }
    } catch(e) { alert('Erreur serveur.'); }
}

async function saveProfile() {
    const whatsapp = document.getElementById('whatsapp-input').value;
    const nom = document.getElementById('name-input').value;
    const adresse = document.getElementById('address-input').value;
    
    if(!whatsapp || !nom || !adresse) return alert('Remplissez tous les champs.');
    
    try {
        const res = await fetch(`${API_URL}/clients/register`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ telephone: whatsapp, nom, adresse, whatsapp: whatsapp }) 
        });
        const data = await res.json();
        if(data.success) { 
            currentUser = data.client; 
            localStorage.setItem('puff_client', JSON.stringify(currentUser)); 
            document.getElementById('login-modal').style.display = 'none'; 
            updateGreeting(); 
            alert('Compte créé !'); 
        } else {
            alert('Erreur: ' + (data.error || 'inconnue'));
        }
    } catch(e) { alert('Erreur de connexion.'); }
}

function updateGreeting() { 
    const el = document.getElementById('user-greeting'); 
    if(el && currentUser) el.innerHTML = `👋 ${currentUser.nom}`; 
}
function logout() { 
    localStorage.removeItem('puff_client'); 
    location.reload(); 
}

// ===== ZONES & PROMOS =====
async function loadZones() { 
    try { 
        const res = await fetch(`${API_URL}/zones`); 
        allZones = await res.json(); 
        const select = document.getElementById('zone-select'); 
        if(select) { 
            select.innerHTML = '<option value="">-- Choisir votre zone --</option>' + allZones.map(z => `<option value="${z.id}">${z.nom} (Min: ${z.min_commande}€)</option>`).join(''); 
        } 
    } catch (e) { console.error(e); } 
}

function applyZone() { 
    const zoneId = document.getElementById('zone-select').value; 
    selectedZone = allZones.find(z => z.id == zoneId) || null; 
    updateCartUI(); 
}

async function applyPromo() {
    const code = document.getElementById('promo-input').value.trim();
    const msg = document.getElementById('promo-msg');
    if (!code) { msg.textContent = "Entrez un code."; return; }
    msg.textContent = "Vérification..."; msg.style.color = "#aaa";
    try {
        const res = await fetch(`${API_URL}/promo/check`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code }) });
        const data = await res.json();
        
        if (!data.success) {
            window.appliedPromoCode = null; window.appliedPromoPct = 0;
            msg.innerHTML = `❌ ${data.error || 'Code invalide'}`; msg.style.color = "#EF4444";
            if (typeof updateCartUI === "function") updateCartUI();
            return;
        }

        // VÉRIFICATION DE LA CONDITION DE QUANTITÉ
        if (data.categorie_id && data.quantite_min) {
            const cat = allCategories.find(c => c.id === data.categorie_id);
            const catName = cat ? cat.nom : '';
            const catItems = cart.filter(item => item.categorie === catName);
            const totalQty = catItems.reduce((sum, item) => sum + item.qty, 0);
            
            if (totalQty < data.quantite_min) {
                msg.innerHTML = `⚠️ Ajoutez ${data.quantite_min - totalQty} unités de ${catName} pour bénéficier de -${data.pourcentage}%`;
                msg.style.color = "#F59E0B";
                window.appliedPromoCode = null;
                window.appliedPromoPct = 0;
                window.appliedPromoCategorie = null;
                window.appliedPromoQuantiteMin = null;
                updateCartUI();
                return;
            }
        }

        // Application de la promo
        window.appliedPromoCode = code; 
        window.appliedPromoPct = data.pourcentage;
        window.appliedPromoCategorie = data.categorie_id;
        window.appliedPromoQuantiteMin = data.quantite_min;
        console.log('DEBUG: quantite_min recu =', data.quantite_min);
        msg.innerHTML = `✅ Code appliqué : -${data.pourcentage}%`; msg.style.color = "#22C55E";
        
        // Afficher l'image promo si elle existe
        const imgContainer = document.getElementById('promo-image-container');
        const img = document.getElementById('promo-image');
        const imgText = document.getElementById('promo-image-text');
        if (data.image_url && imgContainer && img) {
            img.src = data.image_url;
            imgText.textContent = `-${data.pourcentage}% avec le code ${code}`;
            imgContainer.classList.add('active');
            imgContainer.classList.remove('hidden');
            imgContainer.style.display = 'block';
        }
        
        if (typeof updateCartUI === "function") updateCartUI();
    } catch (e) { msg.textContent = "Erreur"; }
}

async function checkout() {
    try {
        const sched = await fetch(`${API_URL}/settings/order-window`).then(r => r.json());
        if (!sched.isOpen) {
            return alert(`⚠️ Les commandes sont fermées.\n\nNos horaires : ${sched.start} à ${sched.end}.\nRevenez pendant ces heures pour valider votre panier !`);
        }
    } catch(e) {}

    if(!currentUser || !currentUser.id) return alert("Connectez-vous.");
    if(cart.length === 0) return alert('Panier vide');
    if (modeLivraison === 'livraison' && !selectedZone) return alert('Veuillez choisir une zone pour la livraison.');
    
    const totalOriginal = cart.reduce((sum, item) => sum + (item.prix * item.qty), 0);
    const promoCode = window.appliedPromoCode || null;
    const zoneNom = selectedZone ? selectedZone.nom : null;
    const btn = document.getElementById('checkout-btn'); btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/commandes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: currentUser.id, cart: cart, total: totalOriginal, promo_code: promoCode, valide_par: currentUser.nom, zone: modeLivraison === 'retrait' ? null : zoneNom, mode_livraison: modeLivraison }) });
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

// ===== AVIS CLIENT =====
let selectedNote = 0;
let currentSondage = null;
let selectedSondageOption = null;

function openAvisModal() { 
    document.getElementById('avis-modal').classList.remove('hidden'); 
}
function closeAvisModal() { 
    document.getElementById('avis-modal').classList.add('hidden'); 
}
function toggleAvisList() {
    const list = document.getElementById('avis-list-container');
    const icon = document.getElementById('avis-toggle-icon');
    const text = document.getElementById('avis-toggle-text');
    if (list.classList.contains('hidden')) {
        list.classList.remove('hidden');
        icon.style.transform = 'rotate(180deg)';
        text.textContent = 'Masquer les avis';
        loadPublicAvis();
    } else {
        list.classList.add('hidden');
        icon.style.transform = 'rotate(0deg)';
        text.textContent = 'Voir les avis de la communaute';
    }
}

async function submitAvis() {
    const text = document.getElementById('avis-text').value.trim();
    if (selectedNote === 0) return alert("Veuillez selectionner une note (etoiles).");
    if (!text) return alert("Veuillez ecrire un commentaire.");
    
    try {
        const res = await fetch(`${API_URL}/avis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ note: selectedNote, commentaire: text })
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            document.getElementById('avis-text').value = '';
            selectedNote = 0;
            const starSpans = document.querySelectorAll('#star-rating span');
            starSpans.forEach(s => { s.classList.add('text-gray-500'); s.classList.remove('text-yellow-400'); });
            closeAvisModal();
        } else {
            alert('Erreur: ' + (data.error || 'inconnue'));
        }
    } catch(e) { alert("Erreur reseau."); }
}

async function loadPublicAvis() {
    const container = document.getElementById('avis-list-container');
    if (!container) return;
    
    container.innerHTML = '<p class="text-center text-gray-500 italic text-sm col-span-full">Chargement...</p>';
    
    try {
        const res = await fetch(`${API_URL}/avis/approuves`);
        const avis = await res.json();
        if (avis.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 italic text-sm col-span-full">Aucun avis pour le moment. Soyez le premier !</p>';
            return;
        }
        container.innerHTML = avis.map(a => {
            const stars = '★'.repeat(a.note) + '☆'.repeat(5 - a.note);
            return `
            <div class="glass-panel p-4 rounded-xl border border-white/5">
                <div class="text-yellow-400 text-lg mb-1">${stars}</div>
                <p class="text-gray-300 text-sm italic mb-2">"${a.commentaire}"</p>
                <div class="text-xs text-gray-500 text-right">- Client Anonyme</div>
            </div>`;
        }).join('');
    } catch(e) { container.innerHTML = 'Erreur de chargement.'; }
}

// ===== SONDAGE CLIENT =====
async function loadSondage() {
    try {
        const res = await fetch(`${API_URL}/sondage/actif`);
        const data = await res.json();
        if (!data.sondage) {
            document.getElementById('sondage-container').classList.add('hidden');
            return;
        }
        currentSondage = data.sondage;
        document.getElementById('sondage-container').classList.remove('hidden');
        document.getElementById('sondage-question').textContent = currentSondage.question;
        
        const hasVoted = localStorage.getItem('sondage_voted_' + currentSondage.id);
        
        const optionsContainer = document.getElementById('sondage-options');
        const resultsContainer = document.getElementById('sondage-results');
        const voteBtn = document.getElementById('sondage-vote-btn');
        const msg = document.getElementById('sondage-msg');
        
        if (hasVoted) {
            optionsContainer.innerHTML = '';
            voteBtn.classList.add('hidden');
            await loadSondageResults(currentSondage.id);
        } else {
            optionsContainer.innerHTML = '';
            const options = typeof currentSondage.options === 'string' ? JSON.parse(currentSondage.options) : currentSondage.options;
            options.forEach((opt, i) => {
                const btn = document.createElement('button');
                btn.className = 'w-full text-left p-3 rounded-xl bg-space-surface/60 border border-white/10 hover:border-nebula-cyan transition-all text-sm text-white';
                btn.textContent = opt;
                btn.onclick = () => {
                    optionsContainer.querySelectorAll('button').forEach(b => b.classList.remove('border-nebula-cyan', 'bg-nebula-cyan/10'));
                    btn.classList.add('border-nebula-cyan', 'bg-nebula-cyan/10');
                    selectedSondageOption = i;
                    voteBtn.classList.remove('hidden');
                    msg.textContent = '';
                };
                optionsContainer.appendChild(btn);
            });
            resultsContainer.classList.add('hidden');
            voteBtn.classList.remove('hidden');
        }
    } catch (e) {
        console.error('Erreur chargement sondage:', e);
    }
}

async function submitVote() {
    if (selectedSondageOption === null || !currentSondage) return alert('Sélectionnez une option.');
    
    try {
        const res = await fetch(`${API_URL}/sondage/${currentSondage.id}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ option_index: selectedSondageOption })
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
            localStorage.setItem('sondage_voted_' + currentSondage.id, 'true');
            document.getElementById('sondage-msg').textContent = '✅ Merci pour votre vote !';
            document.getElementById('sondage-msg').className = 'text-xs text-center mt-2 text-green-400';
            
            document.getElementById('sondage-options').innerHTML = '';
            document.getElementById('sondage-vote-btn').classList.add('hidden');
            await loadSondageResults(currentSondage.id);
        } else {
            alert('Erreur: ' + (data.error || 'inconnue'));
        }
    } catch (e) {
        alert('Erreur réseau.');
    }
}

async function loadSondageResults(sondageId) {
    try {
        const res = await fetch(`${API_URL}/sondage/${sondageId}/resultats`);
        const data = await res.json();
        
        const options = JSON.parse(data.sondage.options);
        const total = data.results.reduce((sum, r) => sum + r.count, 0);
        
        const resultsContainer = document.getElementById('sondage-results');
        resultsContainer.classList.remove('hidden');
        
        if (total === 0) {
            resultsContainer.innerHTML = '<p class="text-xs text-gray-500 text-center">Aucun vote pour le moment.</p>';
            return;
        }
        
        resultsContainer.innerHTML = options.map((opt, i) => {
            const result = data.results.find(r => r.option_index === i);
            const count = result ? result.count : 0;
            const pct = total > 0 ? (count / total * 100).toFixed(1) : 0;
            return `
                <div class="mb-2">
                    <div class="flex justify-between text-xs mb-1">
                        <span class="text-white">${opt}</span>
                        <span class="text-gray-400">${count} vote${count > 1 ? 's' : ''} (${pct}%)</span>
                    </div>
                    <div class="h-2 bg-black/40 rounded-full overflow-hidden">
                        <div class="h-full bg-gradient-to-r from-nebula-violet to-nebula-cyan" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Erreur résultats sondage:', e);
    }
}

// ===== INITIALISATION FINALE (étoiles avis) =====
document.addEventListener('DOMContentLoaded', () => {
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
});