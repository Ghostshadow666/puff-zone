const fs = require('fs');

// ==========================================
// 1. MODIFICATION DU SERVEUR (server.js)
// ==========================================
let serverContent = fs.readFileSync('server.js', 'utf8');

// 1.1 Ajout de la colonne "categorie_nom" dans commande_items
const initTarget = "await pool.query('ALTER TABLE commande_items ADD COLUMN IF NOT EXISTS prix_achat DECIMAL(10,2) DEFAULT 0;');";
const initReplace = initTarget + `
    await pool.query('ALTER TABLE commande_items ADD COLUMN IF NOT EXISTS categorie_nom VARCHAR(100);');
    `;
serverContent = serverContent.replace(initTarget, initReplace);

// 1.2 Modification de l'INSERT dans POST /api/commandes
const insertTarget = "await client.query('INSERT INTO commande_items (commande_id, saveur_nom, quantite, prix) VALUES ($1,$2,$3,$4)', [cmd.rows[0].id, item.nom, item.qty, item.prix]);";
const insertReplace = "await client.query('INSERT INTO commande_items (commande_id, saveur_nom, quantite, prix, categorie_nom) VALUES ($1,$2,$3,$4,$5)', [cmd.rows[0].id, item.nom, item.qty, item.prix, item.categorie || null]);";
serverContent = serverContent.replace(insertTarget, insertReplace);

// 1.3 Modification des requêtes GET (Admin et Livreur) pour récupérer la catégorie
const jsonAggOld = "json_build_object('nom', ci.saveur_nom, 'qte', ci.quantite, 'prix', ci.prix)";
const jsonAggNew = "json_build_object('nom', ci.saveur_nom, 'categorie', ci.categorie_nom, 'qte', ci.quantite, 'prix', ci.prix)";
// On remplace toutes les occurrences (il y en a 2 : admin et livreur)
serverContent = serverContent.split(jsonAggOld).join(jsonAggNew);

fs.writeFileSync('server.js', serverContent, 'utf8');
console.log("✅ server.js : Sauvegarde et récupération de la catégorie dans les commandes.");


// ==========================================
// 2. MODIFICATION DE L'ADMIN (admin.html)
// ==========================================
let adminContent = fs.readFileSync('public/admin.html', 'utf8');

// On modifie l'affichage des items dans renderCommandeCard
const adminItemsOld = "itemsHtml += `<div class=\"flex justify-between\"><span>${i.qte}x ${escapeHTML(i.nom)}</span><span class=\"text-gray-400\">${parseFloat(i.prix).toFixed(2)}€/u</span></div>`;";
const adminItemsNew = "itemsHtml += `<div class=\"flex justify-between\"><span>${i.qte}x ${escapeHTML(i.nom)} ${i.categorie ? `<span class=\"text-gray-500 text-[10px]\">(${escapeHTML(i.categorie)})</span>` : ''}</span><span class=\"text-gray-400\">${parseFloat(i.prix).toFixed(2)}€/u</span></div>`;";

if (adminContent.includes(adminItemsOld)) {
    adminContent = adminContent.replace(adminItemsOld, adminItemsNew);
    fs.writeFileSync('public/admin.html', adminContent, 'utf8');
    console.log("✅ admin.html : Catégorie affichée dans le détail de la commande.");
} else {
    console.log("⚠️ Impossible de trouver la ligne d'affichage des items dans admin.html.");
}


// ==========================================
// 3. MODIFICATION DU LIVREUR (livreur.html)
// ==========================================
if (fs.existsSync('public/livreur.html')) {
    let livreurContent = fs.readFileSync('public/livreur.html', 'utf8');
    
    const livreurItemsOld = "itemsHtml += `<div class=\"flex justify-between\"><span>${i.qte}x ${escapeHTML(i.nom)}</span></div>`;";
    const livreurItemsNew = "itemsHtml += `<div class=\"flex justify-between\"><span>${i.qte}x ${escapeHTML(i.nom)} ${i.categorie ? `<span class=\"text-gray-500 text-[10px]\">(${escapeHTML(i.categorie)})</span>` : ''}</span></div>`;";

    if (livreurContent.includes(livreurItemsOld)) {
        livreurContent = livreurContent.replace(livreurItemsOld, livreurItemsNew);
        fs.writeFileSync('public/livreur.html', livreurContent, 'utf8');
        console.log("✅ livreur.html : Catégorie affichée dans le détail de la commande.");
    } else {
        console.log("⚠️ Impossible de trouver la ligne d'affichage des items dans livreur.html.");
    }
}
