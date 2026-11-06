const fs = require('fs');

// ==========================================
// 1. CORRECTION DU CÔTÉ CLIENT (script.js)
// ==========================================
let scriptContent = fs.readFileSync('public/script.js', 'utf8');

// 1.1 On ajoute les prix des lots dans le panier lors de l'ajout
scriptContent = scriptContent.replace(
    "cart.push({ id: flav.id, nom: flav.nom, categorie: cat.nom, prix: cat.prix_unite, qty: 1 });",
    "cart.push({ id: flav.id, nom: flav.nom, categorie: cat.nom, prix: cat.prix_unite, prix_lot_5: cat.prix_lot_5, prix_lot_10: cat.prix_lot_10, qty: 1 });"
);

// 1.2 On ajoute une fonction de calcul intelligent
const calcFunction = `
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
        detail.push(\`\${nbLots10}x Lot10 (\${p10}€)\`);
        qty = qty % 10;
    }
    // Calcul des lots de 5
    if (p5 && qty >= 5) {
        let nbLots5 = Math.floor(qty / 5);
        total += nbLots5 * p5;
        detail.push(\`\${nbLots5}x Lot5 (\${p5}€)\`);
        qty = qty % 5;
    }
    // Calcul du reste à l'unité
    if (qty > 0) {
        total += qty * p1;
        detail.push(\`\${qty}x Unité (\${p1}€)\`);
    }

    return { total, detail: detail.join(' + ') };
}
`;

// On l'insère juste avant updateCartUI
scriptContent = scriptContent.replace("function updateCartUI() {", calcFunction + "\nfunction updateCartUI() {");

// 1.3 On modifie l'affichage du panier pour utiliser ce calcul
const oldCartLoop = `cart.forEach((item, index) => {
        total += item.prix * item.qty;`;

const newCartLoop = `cart.forEach((item, index) => {
        const calc = calculerPrixItem(item);
        total += calc.total;`;

scriptContent = scriptContent.replace(oldCartLoop, newCartLoop);

// 1.4 On affiche le détail du prix (ex: 1x Lot10 + 2x Unité)
const oldPriceDisplay = `<span class="text-xs font-bold text-nebula-cyan">\${(item.prix * item.qty).toFixed(2)} €</span>`;
const newPriceDisplay = `<span class="text-xs font-bold text-nebula-cyan" title="\${calc.detail}">\${calc.total.toFixed(2)} €</span>`;

scriptContent = scriptContent.replace(oldPriceDisplay, newPriceDisplay);

fs.writeFileSync('public/script.js', scriptContent, 'utf8');
console.log("✅ script.js mis à jour (Calcul des lots côté client)");


// ==========================================
// 2. CORRECTION DU CÔTÉ SERVEUR (server.js)
// ==========================================
let serverContent = fs.readFileSync('server.js', 'utf8');

// On va remplacer la route POST /api/commandes par une version qui recalcule tout
const oldRouteStart = "app.post('/api/commandes', publicLimiter, async (req, res) => {";
const oldRouteEnd = "app.get('/api/commandes', authenticateToken, isAdmin, async (req, res) => {";

const startIndex = serverContent.indexOf(oldRouteStart);
const endIndex = serverContent.indexOf(oldRouteEnd);

if (startIndex !== -1 && endIndex !== -1) {
    const newRoute = `app.post('/api/commandes', publicLimiter, async (req, res) => { 
  const { client_id, cart, total, promo_code, valide_par } = req.body; 
  const client = await pool.connect();
  
  try { 
    await client.query('BEGIN');

    let calculatedTotal = 0;

    // 1. Vérification et verrouillage des stocks + Calcul du vrai prix
    for (const item of cart) { 
      // On récupère le stock et les prix de la catégorie liée à cette saveur
      const s = await client.query(
        \`SELECT s.stock, c.prix_unite, c.prix_lot_5, c.prix_lot_10 
         FROM saveurs s 
         JOIN categories c ON s.categorie_id = c.id 
         WHERE s.nom = $1 FOR UPDATE\`, 
        [item.nom]
      ); 

      if (s.rows.length === 0 || item.qty > s.rows[0].stock) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: \`Stock insuffisant pour "\${item.nom}".\` }); 
      }

      // --- CALCUL DU PRIX CÔTÉ SERVEUR (SÉCURITÉ ANTI-TRICHE) ---
      const dbItem = s.rows[0];
      let qty = item.qty;
      const p1 = parseFloat(dbItem.prix_unite);
      const p5 = dbItem.prix_lot_5 ? parseFloat(dbItem.prix_lot_5) : null;
      const p10 = dbItem.prix_lot_10 ? parseFloat(dbItem.prix_lot_10) : null;

      if (p10 && qty >= 10) {
          let nbLots10 = Math.floor(qty / 10);
          calculatedTotal += nbLots10 * p10;
          qty = qty % 10;
      }
      if (p5 && qty >= 5) {
          let nbLots5 = Math.floor(qty / 5);
          calculatedTotal += nbLots5 * p5;
          qty = qty % 5;
      }
      if (qty > 0) {
          calculatedTotal += qty * p1;
      }
    } 

    // 2. Application du code promo sur le total recalculé
    let finalTotal = calculatedTotal; 
    if (promo_code) { 
      const p = await client.query('SELECT * FROM codes_promo WHERE UPPER(code) = UPPER($1)', [promo_code]); 
      if (p.rows.length > 0) finalTotal -= (finalTotal * (p.rows[0].pourcentage / 100)); 
    } 

    // 3. Création de la commande avec le VRAI total
    const cmd = await client.query('INSERT INTO commandes (client_id, total, valide_par, promo_code) VALUES ($1,$2,$3,$4) RETURNING id', [client_id, finalTotal, valide_par || 'Client', promo_code || null]); 
    
    // 4. Ajout des items et déduction du stock
    for (const item of cart) { 
      // On garde le prix unitaire de base pour l'historique, mais le total global est juste
      const s = await client.query('SELECT prix_unite FROM categories c JOIN saveurs s ON c.id = s.categorie_id WHERE s.nom = $1', [item.nom]);
      await client.query('INSERT INTO commande_items (commande_id, saveur_nom, quantite, prix) VALUES ($1,$2,$3,$4)', [cmd.rows[0].id, item.nom, item.qty, s.rows[0].prix_unite]); 
      await client.query('UPDATE saveurs SET stock = stock - $1 WHERE nom = $2', [item.qty, item.nom]); 
    } 

    await client.query('COMMIT');
    await logAction({name: valide_par || 'Client', role: 'client'}, 'Nouvelle Commande', \`Cmd #\${cmd.rows[0].id}\`); 
    res.json({ success: true, commande_id: cmd.rows[0].id, finalTotal }); 
    
  } catch (e) { 
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ error: 'Erreur lors de la commande.' }); 
  } finally {
    client.release();
  }
});

`;
    serverContent = serverContent.substring(0, startIndex) + newRoute + serverContent.substring(endIndex);
    fs.writeFileSync('server.js', serverContent, 'utf8');
    console.log("✅ server.js mis à jour (Recalcul sécurisé des lots côté serveur)");
} else {
    console.log("❌ Impossible de trouver la route des commandes.");
}
