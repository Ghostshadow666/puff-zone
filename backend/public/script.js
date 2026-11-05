const API_URL = '/api';
let allCategories = [];
let allFlavors = [];
let allZones = [];
let cart = [];
let currentUser = JSON.parse(localStorage.getItem('puff_client')) || null;
let selectedZone = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('main-site').style.display = 'grid';
    if (currentUser) {
        document.getElementById('login-modal').style.display = 'none';
        updateGreeting();
    }
    loadCatalogue();
    loadZones();
    
    // RAFRAICHISSEMENT AUTOMATIQUE DES STOCKS TOUTES LES 30 SECONDES
    setInterval(loadCatalogue, 30000);
});

function showLoginForm() { document.getElementById('step-choice').style.display = 'none'; document.getElementById('step-phone').style.display = 'block'; document.getElementById('step-info').style.display = 'none'; }
function showRegisterForm() { document.getElementById('step-choice').style.display = 'none'; document.getElementById('step-phone').style.display = 'none'; document.getElementById('step-info').style.display = 'block'; }
function backToChoice() { document.getElementById('step-choice').style.display = 'block'; document.getElementById('step-phone').style.display = 'none'; document.getElementById('step-info').style.display = 'none'; }

async function checkPhone() {
    const phone = document.getElementById('phone-input').value;
    if(!phone || phone.length < 8) return alert('Num\u00e9ro invalide');
    try {
        const res = await fetch(`${API_URL}/clients/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telephone: phone }) });
        if (res.ok) {
            const data = await res.json(); currentUser = data.client; localStorage.setItem('puff_client', JSON.stringify(currentUser)); document.getElementById('login-modal').style.display = 'none'; updateGreeting();
        } else {
            alert('Num\u00e9ro non reconnu. Veuillez cr\u00e9er un compte.'); showRegisterForm(); document.getElementById('phone-input-reg').value = phone; 
        }
    } catch(e) { alert('Erreur de connexion au serveur.'); }
}

async function saveProfile() {
    const phone = document.getElementById('phone-input-reg').value; const nom = document.getElementById('name-input').value; const adresse = document.getElementById('address-input').value; const whatsapp = document.getElementById('whatsapp-input').value;
    if(!phone || !nom || !adresse) return alert('Remplissez tous les champs obligatoires');
    try {
        const res = await fetch(`${API_URL}/clients/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telephone: phone, nom, adresse, whatsapp }) });
        const data = await res.json();
        if(data.success) { currentUser = data.client; localStorage.setItem('puff_client', JSON.stringify(currentUser)); document.getElementById('login-modal').style.display = 'none'; updateGreeting(); alert('Compte cr\u00e9\u00e9 / mis \u00e0 jour avec succ\u00e8s !'); }
    } catch(e) { alert('Erreur lors de la cr\u00e9ation du compte.'); }
}

function updateGreeting() { document.getElementById('user-greeting').innerHTML = `&#128075; ${currentUser.nom} <a href="/compte.html" style="font-size:12px; color:#00f3ff; margin-left:10px;">(Mon compte)</a>`; }
function logout() { localStorage.removeItem('puff_client'); location.reload(); }

async function loadCatalogue() {
    try {
        const res = await fetch(`${API_URL}/catalogue`);
        const data = await res.json();
        allCategories = data.categories;
        allFlavors = data.saveurs;
        renderCatalogueInColumns();
    } catch (e) { document.getElementById('product-list').innerHTML = '<p style="color:red;">Erreur de chargement du catalogue.</p>'; }
}

async function loadZones() {
    try {
        const res = await fetch(`${API_URL}/zones`);
        allZones = await res.json();
        const select = document.getElementById('zone-select');
        if(select) {
            select.innerHTML = '<option value="">-- Choisir votre zone (Obligatoire) --</option>' + allZones.map(z => `<option value="${z.id}">${z.nom} (Min: ${z.min_commande}&euro;)</option>`).join('');
        }
    } catch (e) { console.error("Erreur chargement zones", e); }
}

function applyZone() {
    const zoneId = document.getElementById('zone-select').value;
    selectedZone = allZones.find(z => z.id == zoneId) || null;
    updateCartUI();
}

function renderCatalogueInColumns() {
    const container = document.getElementById('product-list');
    let html = '';
    allCategories.forEach(cat => {
        const catFlavors = allFlavors.filter(f => f.categorie_id === cat.id);
        const img = cat.image_url || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23111"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="40">&#128168;</text></svg>';
        html += `
        <div class="category-column">
            <div class="category-header"><img src="${img}"><h2>${cat.nom}</h2><span class="price-badge">D&egrave;s ${cat.prix_unite}&euro;</span></div>
            <div class="flavor-list">
                ${catFlavors.map(f => {
                    const isOut = f.stock <= 0;
                    const stockHtml = isOut ? `<span style="color: #EF4444; font-size: 0.75rem; margin-left: 8px; font-weight: bold;">(Rupture)</span>` : `<span style="color: #22C55E; font-size: 0.75rem; margin-left: 8px; font-weight: bold;">(Stock: ${f.stock})</span>`;
                    return `<div class="flavor-row"><div class="flavor-info"><span class="flavor-name">${f.nom}</span>${stockHtml}</div>${isOut ? `<button disabled class="btn-mini">&times;</button>` : `<button onclick="addToCart(${f.id})" class="btn-mini">+</button>`}</div>`;
                }).join('')}
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

function addToCart(flavId) {
    if(!currentUser) { document.getElementById('login-modal').style.display = 'flex'; return; }
    const flav = allFlavors.find(f => f.id === flavId);
    if (!flav || flav.stock <= 0) return;
    const cat = allCategories.find(c => c.id === flav.categorie_id);
    const existing = cart.find(item => item.id === flavId);
    if(existing) { 
        if (existing.qty >= flav.stock) { alert(`Stock maximum atteint (${flav.stock} dispo).`); return; }
        existing.qty++; 
    } else { cart.push({ id: flav.id, nom: flav.nom, categorie: cat.nom, prix: cat.prix_unite, qty: 1 }); }
    updateCartUI(); toggleCart();
}

function updateQty(index, change) {
    const item = cart[index];
    const flav = allFlavors.find(f => f.id === item.id);
    if (change > 0) {
        if (flav && item.qty >= flav.stock) { alert(`Stock maximum atteint (${flav.stock} dispo).`); return; }
        item.qty++;
    } else { item.qty--; if (item.qty <= 0) cart.splice(index, 1); }
    updateCartUI();
}

function updateCartUI() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0); 
    document.getElementById('cart-count').textContent = count;
    const itemsContainer = document.getElementById('cart-items');
    
    if(cart.length === 0) { 
        itemsContainer.innerHTML = '<p style="text-align:center; color:#aaa;">Panier vide</p>'; 
        document.getElementById('cart-total-price').innerHTML = '0 &euro;'; 
        window.appliedPromoCode = null; window.appliedPromoPct = 0;
        if(document.getElementById('promo-input')) document.getElementById('promo-input').value = '';
        if(document.getElementById('promo-msg')) document.getElementById('promo-msg').textContent = '';
        document.getElementById('checkout-btn').disabled = true; document.getElementById('checkout-btn').style.opacity = '0.5';
        return; 
    }
    
    let html = ''; let total = 0;
    cart.forEach((item, index) => {
        total += item.prix * item.qty;
        html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #333;"><div style="flex: 1;"><div style="color:white; font-weight:bold;">${item.nom}</div><div style="color:#aaa; font-size:12px;">${item.categorie} - ${item.prix}&euro;</div></div><div style="display:flex; align-items:center; gap:8px;"><button onclick="updateQty(${index}, -1)" style="background:rgba(255,255,255,0.1); border:none; color:white; width:24px; height:24px; border-radius:4px; cursor:pointer; font-weight:bold;">-</button><span style="color:var(--neon-cyan); font-weight:bold; min-width: 15px; text-align: center;">${item.qty}</span><button onclick="updateQty(${index}, 1)" style="background:rgba(255,255,255,0.1); border:none; color:white; width:24px; height:24px; border-radius:4px; cursor:pointer; font-weight:bold;">+</button><button onclick="removeFromCart(${index})" style="background:none; border:none; color:#ff6b6b; cursor:pointer; font-size:16px; margin-left: 5px;">&times;</button></div></div>`;
    });
    itemsContainer.innerHTML = html; 
    
    let finalTotal = total;
    if (window.appliedPromoPct > 0) { finalTotal = total - (total * (window.appliedPromoPct / 100)); }
    document.getElementById('cart-total-price').innerHTML = finalTotal.toFixed(2) + ' &euro;';

    const checkoutBtn = document.getElementById('checkout-btn'); const zoneMsg = document.getElementById('zone-msg');

    if (!selectedZone) {
        checkoutBtn.disabled = true; checkoutBtn.style.opacity = '0.5';
        if(zoneMsg) { zoneMsg.innerHTML = "&#9888;&#65039; Veuillez choisir votre zone."; zoneMsg.style.color = "#EF4444"; }
    } else if (total < selectedZone.min_commande) {
        checkoutBtn.disabled = true; checkoutBtn.style.opacity = '0.5';
        if(zoneMsg) { zoneMsg.innerHTML = `&#9888;&#65039; Minimum de ${selectedZone.min_commande}&euro; pour la zone ${selectedZone.nom}.`; zoneMsg.style.color = "#EF4444"; }
    } else {
        checkoutBtn.disabled = false; checkoutBtn.style.opacity = '1';
        if(zoneMsg) { zoneMsg.innerHTML = ""; }
    }
}

function removeFromCart(index) { cart.splice(index, 1); updateCartUI(); }
function toggleCart() { const drawer = document.getElementById('cart-drawer'); drawer.style.right = drawer.style.right === '0px' ? '-400px' : '0px'; }

async function checkout() {
    if(!currentUser || !currentUser.id) return alert("Veuillez vous connecter.");
    if(cart.length === 0) return alert('Panier vide');
    if(!selectedZone) return alert('Veuillez choisir une zone.');
    
    const totalOriginal = cart.reduce((sum, item) => sum + (item.prix * item.qty), 0);
    const promoCode = window.appliedPromoCode || null;

    try {
        const res = await fetch(`${API_URL}/commandes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: currentUser.id, cart: cart, total: totalOriginal, promo_code: promoCode, valide_par: currentUser.nom }) });
        const data = await res.json();
        if(res.ok && data.success) {
            alert('\u2705 Commande envoy\u00e9e avec succ\u00e8s !');
            cart = []; window.appliedPromoCode = null; window.appliedPromoPct = 0;
            if(document.getElementById('promo-input')) document.getElementById('promo-input').value = '';
            if(document.getElementById('promo-msg')) document.getElementById('promo-msg').textContent = '';
            updateCartUI(); toggleCart(); window.location.reload(); 
        } else { alert('Erreur : ' + (data.error || 'inconnue')); }
    } catch(e) { alert('Erreur de connexion.'); }
}