const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

const getFile = (name) => path.join(__dirname, 'data', `${name}.json`);

// Lecture sécurisée anti-crash
const readData = (name) => {
    try {
        let content = fs.readFileSync(getFile(name), 'utf8');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1); // Enlève le BOM Windows
        return JSON.parse(content || '[]');
    } catch (e) { return []; }
};
const writeData = (name, data) => fs.writeFileSync(getFile(name), JSON.stringify(data, null, 2));

// --- API PRODUITS ---
app.get('/api/products', (req, res) => {
    let products = readData('products');
    // Sécurité anti "undefined" : on force un stock de 0 si vide
    products = products.map(p => ({ ...p, stock: p.stock || 0 }));
    res.json(products);
});
app.post('/api/admin/products', (req, res) => { writeData('products', req.body); res.json({ success: true }); });

// --- API UTILISATEURS ---
app.post('/api/login', (req, res) => {
    const { phone } = req.body;
    const users = readData('users');
    let user = users.find(u => u.phone === phone);
    if (!user) {
        user = { phone, name: '', address: '', isNew: true };
        users.push(user);
        writeData('users', users);
    }
    res.json(user);
});

app.post('/api/update-profile', (req, res) => {
    const { phone, name, address } = req.body;
    const users = readData('users');
    const userIndex = users.findIndex(u => u.phone === phone);
    if (userIndex !== -1) {
        users[userIndex].name = name;
        users[userIndex].address = address;
        users[userIndex].isNew = false;
        writeData('users', users);
        res.json({ success: true, user: users[userIndex] });
    } else {
        res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
});

// --- API COMMANDES ---
app.post('/api/order', (req, res) => {
    const order = { ...req.body, id: Date.now().toString(), date: new Date().toISOString() };
    const orders = readData('orders');
    orders.push(order);
    writeData('orders', orders);
    
    // Mettre à jour le stock automatiquement
    let products = readData('products');
    const prodIndex = products.findIndex(p => p.name === req.body.product);
    if (prodIndex !== -1 && products[prodIndex].stock > 0) {
        products[prodIndex].stock -= 1;
        writeData('products', products);
    }

    res.json({ success: true });
});
app.get('/api/admin/orders', (req, res) => res.json(readData('orders')));

app.listen(PORT, () => console.log(`✅ Serveur prêt sur http://localhost:${PORT}`));
