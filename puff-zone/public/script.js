let products = [];
let currentUser = null;

async function init() {
    const saved = localStorage.getItem('puffUser');
    if (saved) {
        currentUser = JSON.parse(saved);
        showSite();
    }
}

async function checkPhone() {
    const phone = document.getElementById('phone-input').value;
    if (phone.length < 8) return alert('Numéro invalide');

    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
    });
    const user = await res.json();

    if (user.name && user.address) {
        finishLogin(user); 
    } else {
        document.getElementById('step-phone').style.display = 'none';
        document.getElementById('step-info').style.display = 'block';
        currentUser = user; 
    }
}

async function saveProfile() {
    const name = document.getElementById('name-input').value;
    const address = document.getElementById('address-input').value;
    if (!name || !address) return alert('Remplissez tout');

    const res = await fetch('/api/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: currentUser.phone, name, address })
    });
    const data = await res.json();
    finishLogin(data.user);
}

function finishLogin(user) {
    currentUser = user;
    localStorage.setItem('puffUser', JSON.stringify(user));
    showSite();
}

function showSite() {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('main-site').style.display = 'block';
    document.getElementById('user-greeting').innerText = `👤 ${currentUser.name}`;
    loadProducts();
}

function logout() {
    localStorage.removeItem('puffUser');
    location.reload();
}

async function loadProducts() {
    const res = await fetch('/api/products');
    products = await res.json();
    const list = document.getElementById('product-list');
    list.innerHTML = '';

    products.forEach(p => {
        const flavorsHtml = p.flavors.map(f => `
            <div class="flavor-item">
                <span>${f}</span>
                <button class="btn-add" onclick="order('${p.name.replace(/'/g, "\\'")}', '${f.replace(/'/g, "\\'")}', ${p.price})">+</button>
            </div>
        `).join('');

        list.innerHTML += `
            <div class="product-card">
                <div class="product-header" onclick="this.nextElementSibling.classList.toggle('open')">
                    <div>
                        <div class="product-title">${p.name}</div>
                        <div class="product-stock">${p.stock <= 0 ? '<span style="color:#ef4444">Rupture de stock</span>' : p.stock + ' dispos'}</div>
                    </div>
                    <div class="product-price">dès ${p.price}€</div>
                </div>
                <div class="product-details">
                    <div style="margin-bottom:10px; font-size:12px; color:#aaa;">${p.packs || ''}</div>
                    ${flavorsHtml}
                </div>
            </div>
        `;
    });
}

async function order(productName, flavor, price) {
    if(confirm(`Confirmer la commande de : ${productName} (${flavor}) ?`)) {
        const orderData = {
            phone: currentUser.phone, clientName: currentUser.name, address: currentUser.address,
            product: productName, flavor: flavor, price: price
        };
        await fetch('/api/order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(orderData)
        });
        alert(`✅ Commande validée !`);
        loadProducts(); // Recharge pour mettre à jour le stock
    }
}
init();
