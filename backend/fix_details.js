const fs = require('fs');

// ==========================================
// 1. MODIFICATION DU SERVEUR (server.js)
// ==========================================
let serverContent = fs.readFileSync('server.js', 'utf8');

// 1.1 Ajout de la colonne "zone_nom" dans la base
const initTarget = "await pool.query('ALTER TABLE commandes ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50);');";
const initReplace = initTarget + `
    await pool.query('ALTER TABLE commandes ADD COLUMN IF NOT EXISTS zone_nom VARCHAR(100);');
    `;
serverContent = serverContent.replace(initTarget, initReplace);

// 1.2 Modification de POST /api/commandes pour sauvegarder la zone
const postRouteTarget = "const { client_id, cart, total, promo_code, valide_par } = req.body;";
const postRouteReplace = "const { client_id, cart, total, promo_code, valide_par, zone } = req.body;";
serverContent = serverContent.replace(postRouteTarget, postRouteReplace);

const insertCmdTarget = "const cmd = await client.query('INSERT INTO commandes (client_id, total, valide_par, promo_code) VALUES ($1,$2,$3,$4) RETURNING id', [client_id, finalTotal, valide_par || 'Client', promo_code || null]);";
const insertCmdReplace = "const cmd = await client.query('INSERT INTO commandes (client_id, total, valide_par, promo_code, zone_nom) VALUES ($1,$2,$3,$4,$5) RETURNING id', [client_id, finalTotal, valide_par || 'Client', promo_code || null, zone || null]);";
serverContent = serverContent.replace(insertCmdTarget, insertCmdReplace);

// 1.3 Modification de GET /api/commandes (Admin) pour récupérer les items et la zone
const getCmdTarget = "const r = await pool.query(`SELECT c.*, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, cl.telephone, cl.whatsapp, cl.adresse FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id ORDER BY c.date_commande DESC`);";
const getCmdReplace = "const r = await pool.query(`SELECT c.*, c.zone_nom, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, cl.telephone, cl.whatsapp, cl.adresse, (SELECT json_agg(json_build_object('nom', ci.saveur_nom, 'qte', ci.quantite, 'prix', ci.prix)) FROM commande_items ci WHERE ci.commande_id = c.id) as items FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id ORDER BY c.date_commande DESC`);";
serverContent = serverContent.replace(getCmdTarget, getCmdReplace);

// 1.4 Modification de GET /api/commandes/livreur/:id pour récupérer les items et la zone
const getLivreurTarget = "const r = await pool.query(`SELECT c.*, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, cl.telephone, cl.whatsapp, cl.adresse FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id WHERE c.livreur_id = $1 AND c.statut != 'livre' ORDER BY c.date_commande DESC`, [req.params.id]);";
const getLivreurReplace = "const r = await pool.query(`SELECT c.*, c.zone_nom, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, cl.telephone, cl.whatsapp, cl.adresse, (SELECT json_agg(json_build_object('nom', ci.saveur_nom, 'qte', ci.quantite, 'prix', ci.prix)) FROM commande_items ci WHERE ci.commande_id = c.id) as items FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id WHERE c.livreur_id = $1 AND c.statut != 'livre' ORDER BY c.date_commande DESC`, [req.params.id]);";
serverContent = serverContent.replace(getLivreurTarget, getLivreurReplace);

fs.writeFileSync('server.js', serverContent, 'utf8');
console.log("✅ server.js : Zone et détails des articles ajoutés aux requêtes.");


// ==========================================
// 2. MODIFICATION DU CLIENT (script.js)
// ==========================================
let scriptContent = fs.readFileSync('public/script.js', 'utf8');
// Envoi de la zone lors du checkout
const checkoutTarget = "const promoCode = window.appliedPromoCode || null;";
const checkoutReplace = "const promoCode = window.appliedPromoCode || null;\n    const zoneNom = selectedZone ? selectedZone.nom : null;";
scriptContent = scriptContent.replace(checkoutTarget, checkoutReplace);

const bodyTarget = "body: JSON.stringify({ client_id: currentUser.id, cart: cart, total: totalOriginal, promo_code: promoCode, valide_par: currentUser.nom })";
const bodyReplace = "body: JSON.stringify({ client_id: currentUser.id, cart: cart, total: totalOriginal, promo_code: promoCode, valide_par: currentUser.nom, zone: zoneNom })";
scriptContent = scriptContent.replace(bodyTarget, bodyReplace);

fs.writeFileSync('public/script.js', scriptContent, 'utf8');
console.log("✅ script.js : Zone envoyée lors de la commande.");


// ==========================================
// 3. MODIFICATION DE L'ADMIN (admin.html)
// ==========================================
let adminContent = fs.readFileSync('public/admin.html', 'utf8');

const renderCmdStart = adminContent.indexOf('function renderCommandeCard(cmd, isTerminee)');
if (renderCmdStart !== -1) {
    let braceCount = 0;
    let inFunction = false;
    let endIdx = -1;
    
    for (let i = renderCmdStart; i < adminContent.length; i++) {
        if (adminContent[i] === '{') { braceCount++; inFunction = true; }
        else if (adminContent[i] === '}') {
            braceCount--;
            if (inFunction && braceCount === 0) { endIdx = i; break; }
        }
    }

    if (endIdx !== -1) {
        const newRenderCmd = `function renderCommandeCard(cmd, isTerminee) {
            const statuts = { 'en_attente': 'En attente', 'en_preparation': 'Préparation', 'en_livraison': 'En livraison', 'livre': 'Livré' };
            
            // Génération de la liste des articles
            let itemsHtml = '<div class="mt-2 bg-black/20 p-3 rounded-lg border border-white/5 text-xs text-gray-300"><div class="font-bold text-nebula-cyan mb-1">Détail de la commande :</div>';
            if (cmd.items && cmd.items.length > 0) {
                cmd.items.forEach(i => {
                    itemsHtml += \`<div class="flex justify-between"><span>\${i.qte}x \${escapeHTML(i.nom)}</span><span class="text-gray-400">\${parseFloat(i.prix).toFixed(2)}€/u</span></div>\`;
                });
            } else {
                itemsHtml += '<div>Aucun détail disponible.</div>';
            }
            if (cmd.promo_code) itemsHtml += \`<div class="mt-1 text-purple-400 font-bold">Code Promo : \${cmd.promo_code}</div>\`;
            if (cmd.zone_nom) itemsHtml += \`<div class="mt-1 text-green-400 font-bold">Zone : \${escapeHTML(cmd.zone_nom)}</div>\`;
            itemsHtml += '</div>';

            if (isTerminee) return \`<div class="p-4 mb-3 bg-green-500/5 rounded-xl border border-green-500/20 flex flex-col gap-2"><div class="flex justify-between items-start"><div><div class="font-bold text-white">Cmd #\${cmd.id} - \${escapeHTML(cmd.client_nom)}</div><div class="text-xs text-gray-400 mt-1">📞 \${cmd.telephone} | ✅ Livré</div></div><div class="font-bold text-green-400">\${parseFloat(cmd.total).toFixed(2)} €</div></div>\${itemsHtml}</div>\`;

            let optionsStatut = Object.keys(statuts).map(s => \`<option value="\${s}" \${cmd.statut === s ? 'selected' : ''}>\${statuts[s]}</option>\`).join('');
            let optionsLivreur = \`<option value="">-- Assigner --</option>\` + allLivreurs.map(l => \`<option value="\${l.id}" \${cmd.livreur_id === l.id ? 'selected' : ''}>\${escapeHTML(l.name)}</option>\`).join('');
            
            return \`<div class="p-4 mb-3 bg-space-surface rounded-xl border border-white/10 space-y-3">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="font-bold text-white">Cmd #\${cmd.id} - \${escapeHTML(cmd.client_nom)}</div>
                        <div class="text-xs text-gray-400 mt-1">📞 \${cmd.telephone} | 📍 \${escapeHTML(cmd.adresse) || 'N/A'}</div>
                    </div>
                    <div class="font-bold text-nebula-cyan text-lg">\${parseFloat(cmd.total).toFixed(2)} €</div>
                </div>
                \${itemsHtml}
                <div class="flex gap-2">
                    <select class="bg-space-bg border border-white/10 rounded-lg text-xs p-2 text-white flex-1" onchange="updateStatut(\${cmd.id}, this.value)">\${optionsStatut}</select>
                    <select class="bg-space-bg border border-white/10 rounded-lg text-xs p-2 text-white flex-1" onchange="assignLivreur(\${cmd.id}, this.value)">\${optionsLivreur}</select>
                </div>
            </div>\`;
        }`;
        
        adminContent = adminContent.substring(0, renderCmdStart) + newRenderCmd + adminContent.substring(endIdx + 1);
        fs.writeFileSync('public/admin.html', adminContent, 'utf8');
        console.log("✅ admin.html : Détails des commandes affichés (articles, zone, promo).");
    }
}


// ==========================================
// 4. MODIFICATION DU LIVREUR (livreur.html)
// ==========================================
if (fs.existsSync('public/livreur.html')) {
    let livreurContent = fs.readFileSync('public/livreur.html', 'utf8');
    
    // On cherche la fonction qui affiche les commandes
    const livreurRenderStart = livreurContent.indexOf('function renderCommandeCard(cmd)');
    if (livreurRenderStart !== -1) {
         let braceCount = 0;
         let inFunction = false;
         let endIdx = -1;
         
         for (let i = livreurRenderStart; i < livreurContent.length; i++) {
             if (livreurContent[i] === '{') { braceCount++; inFunction = true; }
             else if (livreurContent[i] === '}') {
                 braceCount--;
                 if (inFunction && braceCount === 0) { endIdx = i; break; }
             }
         }

         if (endIdx !== -1) {
             const newLivreurRender = `function renderCommandeCard(cmd) {
            let itemsHtml = '<div class="mt-2 bg-black/30 p-3 rounded-lg text-xs text-gray-300"><div class="font-bold text-nebula-cyan mb-1">À livrer :</div>';
            if (cmd.items && cmd.items.length > 0) {
                cmd.items.forEach(i => {
                    itemsHtml += \`<div class="flex justify-between"><span>\${i.qte}x \${escapeHTML(i.nom)}</span></div>\`;
                });
            }
            if (cmd.zone_nom) itemsHtml += \`<div class="mt-1 text-green-400 font-bold">Zone : \${escapeHTML(cmd.zone_nom)}</div>\`;
            itemsHtml += '</div>';

            return \`<div class="p-4 mb-3 bg-space-surface rounded-xl border border-white/10 space-y-3">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="font-bold text-white">Cmd #\${cmd.id} - \${escapeHTML(cmd.client_nom)}</div>
                        <div class="text-xs text-gray-400 mt-1">📞 \${cmd.telephone}</div>
                        <div class="text-xs text-gray-400 mt-1">📍 \${escapeHTML(cmd.adresse) || 'N/A'}</div>
                    </div>
                    <div class="font-bold text-green-400 text-lg">\${parseFloat(cmd.total).toFixed(2)} €</div>
                </div>
                \${itemsHtml}
                <div class="flex gap-2">
                    <button onclick="validerLivraison(\${cmd.id})" class="w-full py-2 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg font-bold text-sm hover:bg-green-500/30 transition-all">Valider la livraison</button>
                </div>
            </div>\`;
        }`;
             livreurContent = livreurContent.substring(0, livreurRenderStart) + newLivreurRender + livreurContent.substring(endIdx + 1);
             fs.writeFileSync('public/livreur.html', livreurContent, 'utf8');
             console.log("✅ livreur.html : Détails de la commande affichés.");
         }
    } else {
        console.log("⚠️ Fonction renderCommandeCard non trouvée dans livreur.html. Modification manuelle requise.");
    }
}
