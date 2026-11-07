const fs = require('fs');
const file = 'server.js';
let content = fs.readFileSync(file, 'utf8');

// On cible la requête dans GET /api/commandes
const oldQuery = "const r = await pool.query(`SELECT c.*, c.zone_nom, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, cl.telephone, cl.whatsapp, cl.adresse, (SELECT json_agg(json_build_object('nom', ci.saveur_nom, 'categorie', COALESCE(ci.categorie_nom, c2.nom), 'qte', ci.quantite, 'prix', ci.prix)) FROM commande_items ci LEFT JOIN saveurs s2 ON ci.saveur_nom = s2.nom LEFT JOIN categories c2 ON s2.categorie_id = c2.id WHERE ci.commande_id = c.id) as items FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id ORDER BY c.date_commande DESC`);";

const newQuery = "const r = await pool.query(`SELECT c.*, c.zone_nom, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, cl.telephone, cl.whatsapp, cl.adresse, (SELECT json_agg(json_build_object('nom', ci.saveur_nom, 'categorie', ci.categorie_nom, 'qte', ci.quantite, 'prix', ci.prix)) FROM commande_items ci WHERE ci.commande_id = c.id) as items FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id ORDER BY c.date_commande DESC`);";

if (content.includes(oldQuery)) {
    content = content.replace(oldQuery, newQuery);
    fs.writeFileSync(file, content, 'utf8');
    console.log("✅ server.js : Requête SQL nettoyée (Fini les doublons d'affichage des articles).");
} else {
    console.log("⚠️ Impossible de trouver la requête exacte. Tentative de remplacement par Regex...");
    // Fallback si la chaîne exacte n'est pas trouvée
    const regex = /const r = await pool\.query\(`SELECT c\.\*, c\.zone_nom.*?ORDER BY c\.date_commande DESC`\);/s;
    if (regex.test(content)) {
        content = content.replace(regex, newQuery);
        fs.writeFileSync(file, content, 'utf8');
        console.log("✅ server.js : Requête SQL corrigée via Regex.");
    } else {
        console.log("❌ Échec de la correction automatique.");
    }
}
