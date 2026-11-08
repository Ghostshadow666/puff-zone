const API_URL = '/api';
let currentUser = null;
let cart = [];
let allZones = [];
let selectedZone = null;

// ================= INITIALISATION =================
document.addEventListener('DOMContentLoaded', () => {
    // Charger les données essentielles
    loadCatalogue();
    loadZones();
    loadCart();
    
    // Vérifier si l'utilisateur est déjà connecté
    const savedUser = localStorage.getItem('puff_client');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            updateGreeting();
        } catch(e) { localStorage.removeItem('puff_client'); }
    }
});

// ================= GESTION UTILISATEUR =================
function updateGreeting() {
    const el = document.getElementById('user-greeting');
    if(el && currentUser) el.innerHTML = `&#128075; ${currentUser.nom}`;
}

function showLoginForm() {
    const modal = document.getElementById('login-modal');
    if(modal) {
        modal.style.display = 'flex';
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('register-form').style.display = 'none';
    }
}

function showRegisterForm() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
}

function hideLoginForm() {
    const modal = document.getElementById('login-modal');
    if(modal) modal.style.display = 'none';
}

async function login() {
    const phone = document.getElementById('phone-input').value;
    if (!phone) return alert('Entrez votre numéro.');
    try {
        const res = await fetch(`${API_URL}/clients/login`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ telephone: phone }) 
        });
        const data = await res.json();
        if (res.ok && data.success) {
            currentUser = data.client;
            localStorage.setItem('puff_client', JSON.stringify(currentUser));
            document.getElementById('login-modal').style.display = 'none';
            updateGreeting();
        } else {
            alert('Numéro non reconnu. Veuillez créer un compte.');
            showRegisterForm();
            document.getElementById('phone-input-reg').value = phone;
        }
    } catch(e) { alert('Erreur serveur.'); }
}

async function saveProfile() {
    const phone = document.getElementById('phone-input-reg').value;
    const nom = document.getElementById('name-input').value;
    const adresse = document.getElementById('address-input').value;
    const whatsapp = document.getElementById('whatsapp-input').value;
    if(!phone || !nom || !adresse) return alert('Remplissez les champs.');
    try {
        const res = await fetch(`${API_URL}/clients/register`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ telephone: phone, nom, adresse, whatsapp }) 
        });
        const data = await res.json();
        if(data.success) { 
            currentUser = data.client; 
            localStorage.setItem('puff_client', JSON.stringify(currentUser)); 
            document.getElementById('login-modal').style.display = 'none'; 
            updateGreeting(); 
            alert('Compte créé !'); 
        }
    } catch(e) { alert('Erreur.'); }
}

function logout() {
    localStorage.removeItem('puff_client');
    currentUser = null;
    location.reload();
}

// ================= CATALOGUE & PANIER =================
async function loadCatalogue() {
    try {
        const res = await fetch(`${API_URL}/catalogue`);
        const data = await res.json();
        renderCatalogue(data.categories, data.saveurs);
    } catch(e) { console.error('Erreur chargement catalogue'); }
}

function renderCatalogue(categories, saveurs) {
    const container = document.getElementById('catalogue-container');
    if (!container) return;
    
    // Le rendu HTML de ton catalogue (simplifié pour l'exemple)
    // Tu devras peut-être l'adapter à ton HTML exact
    container.innerHTML = categories.map(cat => {
        const flavs = saveurs.filter(f => f.categorie_id === cat.id);
        return `
        <div class="glass-panel rounded-2xl overflow-hidden mb-6">
            <div class="p-4 bg-white/5 cursor-pointer flex justify-between items-center" onclick="toggleCategory(${cat.id})">
                <div class="flex items-center gap-3">
                    ${cat.image_url ? `<img src="${cat.image_url}" class="w-12 h-12 rounded-lg object-cover">` : ''}
                    <h3 class="text-white font-bold text-lg">${cat.nom}</h3>
                </div>
                <span id="arrow-${cat.id}" class="text-nebula-cyan text-xl transition-transform">▼</span>
            </div>
            <div id="flavors-${cat.id}" class="hidden p-4 space-y-3">
                ${flavs.map(f => `
                    <div class="flex justify-between items-center bg-black/40 p-3 rounded-xl border border-white/5">
                        <div>
                            <div class="text-white text-sm font-bold">${f.nom}</div>
                            <div class="text-xs text-gray-400">Stock: ${f.stock}</div>
                        </div>
                        <div class="text-right">
                            <div class="text-nebula-cyan font-bold">${cat.prix_unite}€</div>
                            <button onclick="addToCart(${f.id}, '${f.nom}', ${cat.prix_unite})" class="mt-2 text-xs bg-nebula-cyan/20 text-nebula-cyan px-3 py-1 rounded-lg hover:bg-nebula-cyan/30 transition">Ajouter</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }).join('');
}

function toggleCategory(id) {
    const el = document.getElementById(`flavors-${id}`);
    const arrow = document.getElementById(`arrow-${id}`);
    if (el.classList.contains('hidden')) {
        el.classList.remove('hidden');
        arrow.style.transform = 'rotate(0deg)';
    } else {
        el.classList.add('hidden');
        arrow.style.transform = 'rotate(-90deg)';
    }
}

function addToCart(id, nom, prix) {
    const existing = cart.find(item => item.id === id);
    if (existing) {
        existing.qty += 1;
    } else {
        cart.push({ id, nom, prix, qty: 1 });
    }
    saveCart();
    updateCartUI();
}

function saveCart() {
    localStorage.setItem('puff_cart', JSON.stringify(cart));
}

function loadCart() {
    const saved = localStorage.getItem('puff_cart');
    if (saved) {
        try {
            cart = JSON.parse(saved);
            updateCartUI();
        } catch(e) { cart = []; }
    }
}

function updateCartUI() {
    const container = document.getElementById('cart-items');
    const countEl = document.getElementById('cart-count');
    const totalEl = document.getElementById('cart-total');
    
    if (!container) return;
    
    if (countEl) countEl.textContent = cart.reduce((sum, item) => sum + item.qty, 0);
    
    if (cart.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">Votre panier est vide.</p>';
        if (totalEl) totalEl.textContent = '0.00 €';
        return;
    }

    let total = 0;
    container.innerHTML = cart.map(item => {
        total += item.prix * item.qty;
        return `
        <div class="flex justify-between items-center mb-3 p-2 bg-white/5 rounded-lg">
            <div>
                <div class="text-white text-sm">${item.nom}</div>
                <div class="text-xs text-gray-400">${item.prix.toFixed(2)}€ x ${item.qty}</div>
            </div>
            <div class="flex items-center gap-2">
                <button onclick="removeFromCart(${item.id})" class="text-red-400 px-2">-</button>
                <span class="text-white text-sm">${item.qty}</span>
                <button onclick="addToCart(${item.id}, '${item.nom}', ${item.prix})" class="text-green-400 px-2">+</button>
            </div>
        </div>`;
    }).join('');

    if (totalEl) totalEl.textContent = total.toFixed(2) + ' €';
}

function removeFromCart(id) {
    const index = cart.findIndex(item => item.id === id);
    if (index !== -1) {
        if (cart[index].qty > 1) {
            cart[index].qty -= 1;
        } else {
            cart.splice(index, 1);
        }
        saveCart();
        updateCartUI();
    }
}

function toggleCart() {
    const modal = document.getElementById('cart-modal');
    if (modal) {
        if (modal.style.display === 'flex') {
            modal.style.display = 'none';
        } else {
            modal.style.display = 'flex';
        }
    }
}

// ================= ZONES & COMMANDES =================
async function loadZones() {
    try { 
        const res = await fetch(`${API_URL}/zones`); 
        allZones = await res.json(); 
        const select = document.getElementById('zone-select'); 
        if(select) { 
            select.innerHTML = '<option value="">-- Choisir votre zone --</option>' + allZones.map(z => `<option value="${z.id}">${z.nom} (Min: ${z.min_commande}&euro;)</option>`).join(''); 
        } 
    } catch (e) { console.error(e); }
}

function applyZone() { 
    const zoneId = document.getElementById('zone-select').value; 
    selectedZone = allZones.find(z => z.id == zoneId) || null; 
}

async function checkout() {
    if(!currentUser || !currentUser.id) return alert("Veuillez vous connecter pour commander.");
    if(cart.length === 0) return alert('Votre panier est vide.');
    if(!selectedZone) return alert('Veuillez choisir une zone de livraison.');

    const totalOriginal = cart.reduce((sum, item) => sum + (item.prix * item.qty), 0);
    const btn = document.getElementById('checkout-btn'); 
    if(btn) btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/commandes`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ 
                client_id: currentUser.id, 
                cart: cart, 
                total: totalOriginal, 
                valide_par: currentUser.nom,
                zone: selectedZone.nom 
            }) 
        });
        const data = await res.json();
        if(res.ok && data.success) {
            alert('\u2705 Commande envoy\u00e9e avec succ\u00e8s !');
            cart = []; 
            saveCart();
            updateCartUI(); 
            toggleCart(); 
            window.location.reload();
        } else { 
            alert('Erreur : ' + (data.error || 'inconnue')); 
            if(btn) btn.disabled = false; 
        }
    } catch(e) { 
        alert('Erreur de connexion.'); 
        if(btn) btn.disabled = false; 
    }
}