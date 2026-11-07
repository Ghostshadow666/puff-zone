const fs = require('fs');
const file = 'public/admin.html';
let content = fs.readFileSync(file, 'utf8');

// On cherche la fonction renderCommandeCard
const startIdx = content.indexOf('function renderCommandeCard(cmd, isTerminee)');
if (startIdx !== -1) {
    let braceCount = 0;
    let inFunction = false;
    let endIdx = -1;
    
    for (let i = startIdx; i < content.length; i++) {
        if (content[i] === '{') { braceCount++; inFunction = true; }
        else if (content[i] === '}') {
            braceCount--;
            if (inFunction && braceCount === 0) { endIdx = i; break; }
        }
    }

    if (endIdx !== -1) {
        const newRender = `function renderCommandeCard(cmd, isTerminee) {
            const statuts = { 'en_attente': 'En attente', 'en_preparation': 'Préparation', 'en_livraison': 'En livraison', 'livre': 'Livré' };
            
            // Préparation des liens WhatsApp et Maps
            const tel = (cmd.whatsapp || cmd.telephone || '').replace(/\\D/g, '');
            const adresse = cmd.adresse || '';
            const mapLink = adresse ? \`https://www.google.com/maps/search/?api=1&query=\${encodeURIComponent(adresse)}\` : '#';

            // Génération de la liste des articles AVEC LA CATÉGORIE
            let itemsHtml = '<div class="mt-3 bg-black/40 p-3 rounded-lg border border-white/5 text-xs text-gray-300 space-y-1"><div class="font-bold text-nebula-cyan mb-2 border-b border-white/10 pb-1">Détail de la commande :</div>';
            if (cmd.items && cmd.items.length > 0) {
                cmd.items.forEach(i => {
                    itemsHtml += \`<div class="flex justify-between items-center">
                        <span>\${i.qte}x <strong class="text-white">\${escapeHTML(i.nom)}</strong> \${i.categorie ? \`<span class="text-gray-500 text-[10px] ml-1">(\${escapeHTML(i.categorie)})</span>\` : ''}</span>
                        <span class="text-gray-400">\${parseFloat(i.prix).toFixed(2)}€/u</span>
                    </div>\`;
                });
            } else {
                itemsHtml += '<div>Aucun détail disponible.</div>';
            }
            if (cmd.promo_code) itemsHtml += \`<div class="mt-2 pt-2 border-t border-white/10 text-purple-400 font-bold">Code Promo : \${cmd.promo_code}</div>\`;
            if (cmd.zone_nom) itemsHtml += \`<div class="mt-1 text-green-400 font-bold">Zone : \${escapeHTML(cmd.zone_nom)}</div>\`;
            itemsHtml += '</div>';

            // Bloc WhatsApp et Maps (style bouton/onglet bien visible)
            let contactHtml = \`<div class="flex gap-2 mt-3">
                \${tel ? \`<a href="https://wa.me/\${tel}" target="_blank" class="flex-1 py-2.5 rounded-xl bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-all text-xs font-bold flex items-center justify-center gap-2"><i data-lucide="message-circle" class="w-4 h-4"></i> Contacter sur WhatsApp</a>\` : ''}
                \${adresse ? \`<a href="\${mapLink}" target="_blank" class="flex-1 py-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 transition-all text-xs font-bold flex items-center justify-center gap-2"><i data-lucide="map" class="w-4 h-4"></i> Ouvrir dans Maps</a>\` : ''}
            </div>\`;

            if (isTerminee) return \`<div class="p-4 mb-3 bg-green-500/5 rounded-xl border border-green-500/20 flex flex-col gap-2">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="font-bold text-white text-lg">Cmd #\${cmd.id} - \${escapeHTML(cmd.client_nom)}</div>
                        <div class="text-xs text-gray-400 mt-1">📞 \${cmd.telephone} | ✅ Livré</div>
                    </div>
                    <div class="font-bold text-green-400 text-xl">\${parseFloat(cmd.total).toFixed(2)} €</div>
                </div>
                \${itemsHtml}
            </div>\`;

            let optionsStatut = Object.keys(statuts).map(s => \`<option value="\${s}" \${cmd.statut === s ? 'selected' : ''}>\${statuts[s]}</option>\`).join('');
            let optionsLivreur = \`<option value="">-- Assigner --</option>\` + allLivreurs.map(l => \`<option value="\${l.id}" \${cmd.livreur_id === l.id ? 'selected' : ''}>\${escapeHTML(l.name)}</option>\`).join('');
            
            return \`<div class="p-4 mb-4 bg-space-surface rounded-2xl border border-white/10 space-y-3 shadow-lg">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="font-bold text-white text-lg">Cmd #\${cmd.id} - \${escapeHTML(cmd.client_nom)}</div>
                        <div class="text-xs text-gray-400 mt-1">📞 \${cmd.telephone} | 📍 \${escapeHTML(cmd.adresse) || 'N/A'}</div>
                    </div>
                    <div class="font-bold text-nebula-cyan text-2xl">\${parseFloat(cmd.total).toFixed(2)} €</div>
                </div>
                
                \${itemsHtml}
                \${contactHtml}
                
                <div class="flex flex-col sm:flex-row gap-2 mt-3 pt-3 border-t border-white/10">
                    <div class="flex-1">
                        <label class="text-[10px] text-gray-500 font-bold uppercase block mb-1">Statut de la commande</label>
                        <select class="bg-space-bg border border-white/10 rounded-lg text-xs p-2 text-white w-full outline-none focus:border-nebula-cyan" onchange="updateStatut(\${cmd.id}, this.value)">\${optionsStatut}</select>
                    </div>
                    <div class="flex-1">
                        <label class="text-[10px] text-gray-500 font-bold uppercase block mb-1">Livreur assigné</label>
                        <select class="bg-space-bg border border-white/10 rounded-lg text-xs p-2 text-white w-full outline-none focus:border-nebula-cyan" onchange="assignLivreur(\${cmd.id}, this.value)">\${optionsLivreur}</select>
                    </div>
                </div>
            </div>\`;
        }`;
        
        content = content.substring(0, startIdx) + newRender + content.substring(endIdx + 1);
        fs.writeFileSync(file, content, 'utf8');
        console.log("✅ admin.html : Carte de commande redesignée (Boutons clairs + Catégorie affichée).");
    }
}

// On s'assure que le rafraîchissement automatique de la liste des commandes est bien actif
if (!content.includes("setInterval(() => { const commandesTab")) {
    content = content.replace("setInterval(checkNotifications, 3000);", "setInterval(checkNotifications, 3000);\n        setInterval(() => { const commandesTab = document.getElementById('tab-commandes'); if (commandesTab && !commandesTab.classList.contains('hidden')) { loadCommandes(); } }, 5000);");
}
fs.writeFileSync(file, content, 'utf8');
