const fs = require('fs');

// ==========================================
// 1. MODIFICATION DU SERVEUR (server.js) - Requête SQL plus intelligente
// ==========================================
let serverContent = fs.readFileSync('server.js', 'utf8');

const oldQuery = "const r = await pool.query(`SELECT c.*, c.zone_nom, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, cl.telephone, cl.whatsapp, cl.adresse, (SELECT json_agg(json_build_object('nom', ci.saveur_nom, 'categorie', ci.categorie_nom, 'qte', ci.quantite, 'prix', ci.prix)) FROM commande_items ci WHERE ci.commande_id = c.id) as items FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id ORDER BY c.date_commande DESC`);";

const newQuery = "const r = await pool.query(`SELECT c.*, c.zone_nom, COALESCE(NULLIF(cl.nom, ''), 'Client ' || cl.telephone) as client_nom, cl.telephone, cl.whatsapp, cl.adresse, (SELECT json_agg(json_build_object('nom', ci.saveur_nom, 'categorie', COALESCE(ci.categorie_nom, c2.nom), 'qte', ci.quantite, 'prix', ci.prix)) FROM commande_items ci LEFT JOIN saveurs s2 ON ci.saveur_nom = s2.nom LEFT JOIN categories c2 ON s2.categorie_id = c2.id WHERE ci.commande_id = c.id) as items FROM commandes c LEFT JOIN clients cl ON c.client_id = cl.id ORDER BY c.date_commande DESC`);";

if (serverContent.includes(oldQuery)) {
    serverContent = serverContent.replace(oldQuery, newQuery);
    fs.writeFileSync('server.js', serverContent, 'utf8');
    console.log("✅ server.js : Requête SQL mise à jour pour récupérer les catégories même sur les anciennes commandes.");
}


// ==========================================
// 2. MODIFICATION DE L'ADMIN (admin.html) - Groupement et Design compact
// ==========================================
let adminContent = fs.readFileSync('public/admin.html', 'utf8');

// 2.1 Remplacement de loadCommandes pour regrouper
const loadCmdStart = adminContent.indexOf('async function loadCommandes()');
if (loadCmdStart !== -1) {
    let braceCount = 0; let inFunction = false; let endIdx = -1;
    for (let i = loadCmdStart; i < adminContent.length; i++) {
        if (adminContent[i] === '{') { braceCount++; inFunction = true; }
        else if (adminContent[i] === '}') {
            braceCount--;
            if (inFunction && braceCount === 0) { endIdx = i; break; }
        }
    }

    if (endIdx !== -1) {
        const newLoadCmd = `async function loadCommandes() {
            try {
                const res = await fetch(\`\${API_URL}/commandes\`); 
                const commandes = await res.json(); 
                if(!Array.isArray(commandes)) return;
                
                const enCours = commandes.filter(c => c.statut !== 'livre'); 
                const terminees = commandes.filter(c => c.statut === 'livre');
                
                // --- GROUPEMENT DES COMMANDES EN COURS PAR CLIENT ---
                const groupedEnCours = {};
                enCours.forEach(cmd => {
                    const key = cmd.telephone; // On regroupe par numéro de téléphone
                    if (!groupedEnCours[key]) groupedEnCours[key] = [];
                    groupedEnCours[key].push(cmd);
                });
                
                const enCoursHtml = Object.values(groupedEnCours).map(clientOrders => renderGroupedCommandeCard(clientOrders)).join('');
                document.getElementById('commandesEnCours').innerHTML = enCours.length === 0 ? 'Aucune commande en cours.' : enCoursHtml;
                
                document.getElementById('commandesTerminees').innerHTML = terminees.length === 0 ? 'Aucune commande terminée.' : terminees.map(cmd => renderCommandeCard(cmd, true)).join('');
            } catch (e) { 
                console.error(e);
                document.getElementById('commandesEnCours').innerHTML = 'Erreur.'; 
            }
        }`;
        adminContent = adminContent.substring(0, loadCmdStart) + newLoadCmd + adminContent.substring(endIdx + 1);
    }
}

// 2.2 Ajout de la nouvelle fonction renderGroupedCommandeCard
const newGroupedRender = `
function renderGroupedCommandeCard(orders) {
    const firstOrder = orders[0];
    const totalGrouped = orders.reduce((sum, o) => sum + parseFloat(o.total), 0);
    const tel = (firstOrder.whatsapp || firstOrder.telephone || '').replace(/\\D/g, '');
    const adresse = firstOrder.adresse || '';
    const mapLink = adresse ? \`https://www.google.com/maps/search/?api=1&query=\${encodeURIComponent(adresse)}\` : '#';
    const statuts = { 'en_attente': 'En attente', 'en_preparation': 'Préparation', 'en_livraison': 'En livraison', 'livre': 'Livré' };

    // Détail de toutes les commandes
    let ordersDetailHtml = '';
    orders.forEach(cmd => {
        ordersDetailHtml += \`<div class="mb-3 bg-black/20 p-3 rounded-lg border border-white/5">
            <div class="flex justify-between items-center mb-2 border-b border-white/10 pb-1">
                <span class="text-xs font-bold text-nebula-cyan">Commande #\${cmd.id}</span>
                <span class="text-sm font-bold text-white">\${parseFloat(cmd.total).toFixed(2)} €</span>
            </div>\`;
        
        if (cmd.items && cmd.items.length > 0) {
            cmd.items.forEach(i => {
                ordersDetailHtml += \`<div class="flex justify-between text-xs text-gray-300 py-0.5">
                    <span>\${i.qte}x <strong class="text-white">\${escapeHTML(i.nom)}</strong> <span class="text-gray-500 text-[10px]">(\${escapeHTML(i.categorie || 'Inconnue')})</span></span>
                </div>\`;
            });
        }
        if (cmd.promo_code) ordersDetailHtml += \`<div class="text-[10px] text-purple-400 mt-1">Promo: \${cmd.promo_code}</div>\`;
        if (cmd.zone_nom) ordersDetailHtml += \`<div class="text-[10px] text-green-400 mt-1">Zone: \${escapeHTML(cmd.zone_nom)}</div>\`;
        
        let optionsStatut = Object.keys(statuts).map(s => \`<option value="\${s}" \${cmd.statut === s ? 'selected' : ''}>\${statuts[s]}</option>\`).join('');
        let optionsLivreur = \`<option value="">-- Assigner --</option>\` + allLivreurs.map(l => \`<option value="\${l.id}" \${cmd.livreur_id === l.id ? 'selected' : ''}>\${escapeHTML(l.name)}</option>\`).join('');
        
        ordersDetailHtml += \`<div class="flex gap-2 mt-2">
            <select class="bg-space-bg border border-white/10 rounded-lg text-[10px] p-1.5 text-white flex-1 outline-none" onchange="updateStatut(\${cmd.id}, this.value)">\${optionsStatut}</select>
            <select class="bg-space-bg border border-white/10 rounded-lg text-[10px] p-1.5 text-white flex-1 outline-none" onchange="assignLivreur(\${cmd.id}, this.value)">\${optionsLivreur}</select>
        </div></div>\`;
    });

    return \`<div class="p-4 mb-3 bg-space-surface rounded-xl border border-white/10 shadow-lg">
        <div class="flex justify-between items-start mb-3">
            <div>
                <div class="font-bold text-white text-base flex items-center gap-2">
                    \${escapeHTML(firstOrder.client_nom)} 
                    \${orders.length > 1 ? \`<span class="bg-nebula-magenta text-white text-[10px] px-2 py-0.5 rounded-full">\${orders.length} commandes</span>\` : ''}
                </div>
                <div class="text-xs text-gray-400 mt-1">📞 \${firstOrder.telephone} | 📍 \${escapeHTML(adresse) || 'N/A'}</div>
            </div>
            <div class="text-right">
                <div class="text-[10px] text-gray-400 uppercase">Total Groupé</div>
                <div class="font-bold text-nebula-cyan text-xl">\${totalGrouped.toFixed(2)} €</div>
            </div>
        </div>
        
        <div class="max-h-64 overflow-y-auto pr-1">\${ordersDetailHtml}</div>
        
        <div class="flex gap-2 mt-3">
            \${tel ? \`<a href="https://wa.me/\${tel}" target="_blank" class="flex-1 py-1.5 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-all text-xs font-bold flex items-center justify-center gap-1.5"><i data-lucide="message-circle" class="w-3.5 h-3.5"></i> WhatsApp</a>\` : ''}
            \${adresse ? \`<a href="\${mapLink}" target="_blank" class="flex-1 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-all text-xs font-bold flex items-center justify-center gap-1.5"><i data-lucide="map" class="w-3.5 h-3.5"></i> Maps</a>\` : ''}
        </div>
    </div>\`;
}
`;

adminContent = adminContent.replace("function renderCommandeCard(cmd, isTerminee) {", newGroupedRender + "\nfunction renderCommandeCard(cmd, isTerminee) {");

// 2.3 On allège aussi la fonction renderCommandeCard pour les commandes terminées
const renderTermineeStart = adminContent.indexOf('if (isTerminee) return');
if (renderTermineeStart !== -1) {
    const endOfLine = adminContent.indexOf(';', renderTermineeStart);
    if (endOfLine !== -1) {
        const newTerminee = `if (isTerminee) return \`<div class="p-3 mb-2 bg-green-500/5 rounded-lg border border-green-500/20 flex justify-between items-center">
            <div>
                <div class="font-bold text-white text-sm">Cmd #\${cmd.id} - \${escapeHTML(cmd.client_nom)}</div>
                <div class="text-[10px] text-gray-400">\${new Date(cmd.date_commande).toLocaleDateString()}</div>
            </div>
            <div class="font-bold text-green-400 text-sm">\${parseFloat(cmd.total).toFixed(2)} €</div>
        </div>\``;
        adminContent = adminContent.substring(0, renderTermineeStart) + newTerminee + adminContent.substring(endOfLine + 1);
    }
}

fs.writeFileSync('public/admin.html', adminContent, 'utf8');
console.log("✅ admin.html : Commandes regroupées par client et design compacté.");
