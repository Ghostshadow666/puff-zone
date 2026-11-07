const fs = require('fs');
const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

// On cherche le début de la route POST /api/commandes
const startIdx = content.indexOf("app.post('/api/commandes', publicLimiter, async (req, res) => {");
const endIdx = content.indexOf("app.get('/api/commandes', authenticateToken, isAdmin, async (req, res) => {");

if (startIdx !== -1 && endIdx !== -1) {
    const newRoute = `app.post('/api/commandes', publicLimiter, async (req, res) => { 
  const { client_id, cart, total, promo_code, valide_par, zone } = req.body; 
  const client = await pool.connect();
  
  try { 
    await client.query('BEGIN');

    let calculatedTotal = 0;

    // 1. Vérification et verrouillage des stocks + Calcul du vrai prix
    for (const item of cart) { 
      // CORRECTION : On cherche par l'ID de la saveur (item.id) et non par le nom
      const s = await client.query(
        \`SELECT s.stock, c.prix_unite, c.prix_lot_5, c.prix_lot_10 
         FROM saveurs s 
         JOIN categories c ON s.categorie_id = c.id 
         WHERE s.id = $1 FOR UPDATE\`, 
        [item.id]
      ); 

      if (s.rows.length === 0 || item.qty > s.rows[0].stock) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: \`Stock insuffisant ou produit introuvable : "\${item.nom}".\` }); 
      }

      // --- CALCUL DU PRIX CÔTÉ SERVEUR (SÉCURITÉ ANTI-TRICHE) ---
      const dbItem = s.rows[0];
      let qty = item.qty;
      const p1 = parseFloat(dbItem.prix_unite);
      const p5 = dbItem.prix_lot_5 ? parseFloat(dbItem.prix_lot_5) : null;
      const p10 = dbItem.prix_lot_10 ? parseFloat(dbItem.prix_lot_10) : null;

      // Calcul des lots de 10
      if (p10 && qty >= 10) {
          let nbLots10 = Math.floor(qty / 10);
          calculatedTotal += nbLots10 * p10;
          qty = qty % 10;
      }
      // Calcul des lots de 5
      if (p5 && qty >= 5) {
          let nbLots5 = Math.floor(qty / 5);
          calculatedTotal += nbLots5 * p5;
          qty = qty % 5;
      }
      // Calcul du reste à l'unité
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
    const cmd = await client.query('INSERT INTO commandes (client_id, total, valide_par, promo_code, zone_nom) VALUES ($1,$2,$3,$4,$5) RETURNING id', [client_id, finalTotal, valide_par || 'Client', promo_code || null, zone || null]); 
    
    // 4. Ajout des items (avec l'ID de la catégorie pour être sûr) et déduction du stock
    for (const item of cart) { 
      // On récupère l'ID de la catégorie et le prix unitaire de base pour l'historique
      const catInfo = await client.query('SELECT s.categorie_id, c.prix_unite, c.nom as cat_nom FROM saveurs s JOIN categories c ON s.categorie_id = c.id WHERE s.id = $1', [item.id]);
      
      await client.query('INSERT INTO commande_items (commande_id, saveur_nom, quantite, prix, categorie_nom) VALUES ($1,$2,$3,$4,$5)', 
          [cmd.rows[0].id, item.nom, item.qty, catInfo.rows[0].prix_unite, catInfo.rows[0].cat_nom]); 
          
      // On déduit le stock en utilisant l'ID de la saveur (fiable à 100%)
      await client.query('UPDATE saveurs SET stock = stock - $1 WHERE id = $2', [item.qty, item.id]); 
    } 

    await client.query('COMMIT');
    await logAction({name: valide_par || 'Client', role: 'client'}, 'Nouvelle Commande', \`Cmd #\${cmd.rows[0].id} - Total: \${finalTotal.toFixed(2)}€\`); 
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
    content = content.substring(0, startIdx) + newRoute + content.substring(endIdx);
    fs.writeFileSync(file, content, 'utf8');
    console.log("✅ server.js : Calcul des commandes totalement sécurisé (Recherche par ID et non par nom).");
} else {
    console.log("❌ Impossible de trouver la route des commandes.");
}
