const API_URL = '/api';
let allCategories = [];
let allFlavors = [];
let cart = [];
let currentUser = JSON.parse(localStorage.getItem('puff_client')) || null;

// --- INITIALISATION ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('main-site').style.display = 'grid';
    
    if (currentUser) {
        document.getElementById('login-modal').style.display = 'none';
        updateGreeting();
    }
    
    loadCatalogue();
});

// --- GESTION DE LA CONNEXION/INSCRIPTION (UI) ---
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

// --- LOGIQUE DE CONNEXION ---
async function checkPhone() {
    const phone = document.getElementById('phone-input').value;
    if(!phone || phone.length < 8) return alert('Numéro invalide');

    try {
        const res = await fetch(`${API_URL}/clients/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telephone: phone }) 
        });
        
        if (res.ok) {
            const data = await res.json();
            currentUser = data.client; 
            localStorage.setItem('puff_client', JSON.stringify(currentUser));
            document.getElementById('login-modal').style.display = 'none';
            updateGreeting();
        } else {
            alert('Numéro non reconnu. Veuillez créer un compte.');
            showRegisterForm(); // On le redirige vers l'inscription
            // On pré-remplit le numéro pour pas qu'il le retape
            document.getElementById('phone-input-reg').value = phone; 
        }
    } catch(e) { alert('Erreur de connexion au serveur.'); }
}

// --- LOGIQUE D'INSCRIPTION ---
async function saveProfile() {
    const phone = document.getElementById('phone-input-reg').value;
    const nom = document.getElementById('name-input').value;
    const adresse = document.getElementById('address-input').value;
    const whatsapp = document.getElementById('whatsapp-input').value;

    if(!phone || !nom || !adresse) return alert('Remplissez tous les champs obligatoires');

    try {
        const res = await fetch(`${API_URL}/clients/register`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telephone: phone, nom, adresse, whatsapp })
        });
        const data = await res.json();
        if(data.success) {
            currentUser = data.client; 
            localStorage.setItem('puff_client', JSON.stringify(currentUser));
            document.getElementById('login-modal').style.display = 'none';
            updateGreeting();
            alert('Compte créé / mis à jour avec succès !');
        }
    } catch(e) { alert('Erreur lors de la création du compte.'); }
}
function updateGreeting() {
    document.getElementById('user-greeting').innerHTML = `👋 ${currentUser.nom} <a href="/compte.html" style="font-size:12px; color:#00f3ff; margin-left:10px;">(Mon compte)</a>`;
}

function logout() { 
    localStorage.removeItem('puff_client'); 
    location.reload(); 
}

// --- CHARGEMENT DU CATALOGUE (OPTIMISÉ) ---
async function loadCatalogue() {
    try {
        // Une seule requête au lieu de deux !
        const res = await fetch(`${API_URL}/catalogue`);
        const data = await res.json();
        allCategories = data.categories;
        allFlavors = data.saveurs;
        renderCatalogueInColumns();
    } catch (e) { 
        document.getElementById('product-list').innerHTML = '<p style="color:red;">Erreur de chargement du catalogue.</p>'; 
    }
}

function renderCatalogueInColumns() {
    const container = document.getElementById('product-list');
    let html = '';
    
    allCategories.forEach(cat => {
        const catFlavors = allFlavors.filter(f => f.categorie_id === cat.id);
        const img = cat.image_url || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="%23111"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="40">💨</text></svg>';
        
        html += `
        <div class="category-column">
            <div class="category-header">
                <img src="${img}">
                <h2>${cat.nom}</h2>
                <span class="price-badge">Dès ${cat.prix_unite}€</span>
            </div>
            <div class="flavor-list">
                ${catFlavors.map(f => {
                    const isOut = f.stock <= 0;
                    return `<div class="flavor-row">
                        <div class="flavor-info"><span class="flavor-name">${f.nom}</span></div>
                        ${isOut ? `<button disabled class="btn-mini">✕</button>` : `<button onclick="addToCart(${f.id})" class="btn-mini">+</button>`}
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

// --- PANIER ---
function addToCart(flavId) {
    if(!currentUser) { document.getElementById('login-modal').style.display = 'flex'; return; }
    const flav = allFlavors.find(f => f.id === flavId);
    const cat = allCategories.find(c => c.id === flav.categorie_id);
    
    const existing = cart.find(item => item.id === flavId);
    if(existing) { existing.qty++; } 
    else { cart.push({ id: flav.id, nom: flav.nom, categorie: cat.nom, prix: cat.prix_unite, qty: 1 }); }
    
    updateCartUI(); 
    toggleCart();
}

function updateCartUI() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0); 
    document.getElementById('cart-count').textContent = count;
    const itemsContainer = document.getElementById('cart-items');
    
    if(cart.length === 0) { 
        itemsContainer.innerHTML = '<p style="text-align:center; color:#aaa;">Panier vide</p>'; 
        document.getElementById('cart-total-price').textContent = '0 €'; 
        return; 
    }
    
    let html = ''; let total = 0;
    cart.forEach((item, index) => {
        total += item.prix * item.qty;
        html += `<div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #333;">
            <div><div style="color:white; font-weight:bold;">${item.nom}</div><div style="color:#aaa; font-size:12px;">${item.categorie} - ${item.prix}€</div></div>
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="color:var(--neon-cyan); font-weight:bold;">x${item.qty}</span>
                <button onclick="removeFromCart(${index})" style="background:none; border:none; color:#ff6b6b; cursor:pointer;">✕</button>
            </div>
        </div>`;
    });
    
    itemsContainer.innerHTML = html; 
    document.getElementById('cart-total-price').textContent = total.toFixed(2) + ' €';
}

function removeFromCart(index) { cart.splice(index, 1); updateCartUI(); }

function toggleCart() { 
    const drawer = document.getElementById('cart-drawer'); 
    drawer.style.right = drawer.style.right === '0px' ? '-400px' : '0px'; 
}

// --- VALIDATION COMMANDE ---
async function checkout() {
    if(!currentUser || !currentUser.id) {
        alert("Veuillez vous connecter pour valider.");
        return;
    }
    if(cart.length === 0) return alert('Panier vide');
    
    const total = cart.reduce((sum, item) => sum + (item.prix * item.qty), 0);

    try {
        const res = await fetch(`${API_URL}/commandes`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: currentUser.id, cart, total })
        });
        if(res.ok) {
            alert('✅ Commande envoyée avec succès !');
            cart = []; updateCartUI(); toggleCart();
        } else {
            alert('Erreur lors de la validation.');
        }
    } catch(e) { alert('Erreur de connexion au serveur.'); }
}