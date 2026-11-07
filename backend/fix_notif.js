const fs = require('fs');
const file = 'public/admin.html';
let content = fs.readFileSync(file, 'utf8');

// 1. On trouve et remplace la fonction checkNotifications
const startIdx = content.indexOf('async function checkNotifications()');
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
        const newFunc = `async function checkNotifications() {
            try {
                const res = await fetch(\`\${API_URL}/commandes\`); 
                if (!res.ok) return;
                const commandes = await res.json(); 
                if (commandes.length === 0) return;
                
                const maxId = Math.max(...commandes.map(c => c.id)); 
                const badge = document.getElementById('notif-badge');
                
                // Si c'est le premier chargement, on enregistre l'ID sans notifier
                if (lastOrderId === 0) { 
                    lastOrderId = maxId; 
                    localStorage.setItem('lastOrderId', lastOrderId); 
                    return;
                }

                // Si on détecte une nouvelle commande
                if (maxId > lastOrderId) { 
                    playSound(); 
                    const nouvelles = commandes.filter(c => c.id > lastOrderId && c.statut !== 'livre').length; 
                    
                    if (badge && nouvelles > 0) { 
                        badge.textContent = nouvelles; 
                        badge.classList.remove('hidden'); 
                        // On s'assure que le parent est bien en 'relative' pour que le badge se place bien
                        badge.parentElement.classList.add('relative'); 
                    } 
                    
                    // On met à jour le lastOrderId pour ne pas re-sonner pour la même commande
                    lastOrderId = maxId; 
                    localStorage.setItem('lastOrderId', lastOrderId);
                    
                    // On recharge la liste si on est sur l'onglet commandes
                    const commandesTab = document.getElementById('tab-commandes'); 
                    if (commandesTab && !commandesTab.classList.contains('hidden')) { 
                        loadCommandes(); 
                    }
                } 
            } catch (e) { console.error(e); }
        }`;
        
        content = content.substring(0, startIdx) + newFunc + content.substring(endIdx + 1);
        console.log("✅ admin.html : Fonction de notification améliorée.");
    }
}

// 2. On passe l'intervalle de 15 secondes à 3 secondes pour que ce soit instantané
content = content.replace('setInterval(checkNotifications, 15000);', 'setInterval(checkNotifications, 3000);');

fs.writeFileSync(file, content, 'utf8');
