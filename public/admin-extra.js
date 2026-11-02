const API_URL_EXTRA = '/api';

// --- COMMANDES ---
async function loadCommandes() {
  try {
    const res = await fetch(`${API_URL_EXTRA}/commandes`);
    const cmds = await res.json();
    const el = document.getElementById('commandesList');
    if(!el) return;
    
    if(cmds.length === 0) { el.innerHTML = 'Aucune commande.'; return; }
    
    el.innerHTML = cmds.map(c => {
      let statutColor = c.statut === 'en_attente' ? '#F59E0B' : (c.statut === 'preparation' ? '#3B82F6' : (c.statut === 'livraison' ? '#A855F7' : '#22C55E'));
      let waLink = c.whatsapp ? `<a href="https://wa.me/${c.whatsapp.replace(/\D/g,'')}?text=Bonjour%20${c.client_nom},%20votre%20commande%20est%20en%20cours" target="_blank" class="btn" style="padding:5px 10px; font-size:0.7rem; background:#25D366; color:black;">💬 WhatsApp</a>` : '';
      return `
        <div class="item-card" style="flex-direction:column; align-items:stretch; gap:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span class="item-name">Commande #${c.id} - ${c.client_nom}</span>
              <div class="item-details">Total: ${c.total}€ | Tél: ${c.telephone}</div>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
              ${waLink}
              <select onchange="updateStatut(${c.id}, this.value)" style="background:rgba(0,0,0,0.5); color:${statutColor}; border:1px solid ${statutColor}; padding:5px; border-radius:5px;">
                <option value="en_attente" ${c.statut==='en_attente'?'selected':''}>⏳ En attente</option>
                <option value="preparation" ${c.statut==='preparation'?'selected':''}>📦 Préparation</option>
                <option value="livraison" ${c.statut==='livraison'?'selected':''}>🛵 Livraison</option>
                <option value="livre" ${c.statut==='livre'?'selected':''}>✅ Livré</option>
              </select>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch(e) { 
    console.error(e);
    document.getElementById('commandesList').innerHTML = 'Erreur de chargement.'; 
  }
}

async function updateStatut(id, statut) {
  await fetch(`${API_URL_EXTRA}/commandes/${id}/statut`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statut }) });
  loadCommandes();
}

// --- CLIENTS ---
async function loadClients() {
  try {
    const res = await fetch(`${API_URL_EXTRA}/clients`); 
    const clients = await res.json();
    const el = document.getElementById('clientsList');
    if(!el) return;
    
    if(clients.length === 0) { el.innerHTML = 'Aucun client.'; return; }
    
    el.innerHTML = clients.map(c => {
      // Nettoyage du numéro pour WhatsApp
      const waNumber = (c.whatsapp || c.telephone).replace(/\D/g,'');
      const waLink = waNumber ? `<a href="https://wa.me/${waNumber}" target="_blank" class="btn" style="background:#25D366; color:black; padding:6px 12px; font-size:0.75rem; border-radius:5px; text-decoration:none; font-weight:bold;">💬 WhatsApp</a>` : '';
      
      // Bouton copier
      const copyBtn = `<button onclick="copyToClipboard('${c.telephone}')" class="btn" style="background:rgba(255,255,255,0.1); padding:6px 12px; font-size:0.75rem;">📋 Copier</button>`;
      
      // Lien Google Maps
      const mapLink = c.adresse ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.adresse)}" target="_blank" class="btn" style="background:rgba(255,255,255,0.1); padding:6px 12px; font-size:0.75rem; text-decoration:none; color:white;">🗺️ Maps</a>` : '';

      return `
        <div class="item-card" style="display:flex; flex-direction:column; align-items:stretch; gap:15px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:10px;">
            <div>
              <span class="item-name" style="color:var(--cyan); font-size:1.1rem;">${c.nom}</span>
              <div class="item-details" style="margin-top:8px;">📞 Tél : ${c.telephone} ${c.whatsapp ? `| 💬 WhatsApp : ${c.whatsapp}` : ''}</div>
              <div class="item-details" style="margin-top:4px;">📍 Adresse : ${c.adresse || 'Non renseignée'}</div>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              ${waLink}
              ${copyBtn}
              ${mapLink}
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch(e) { 
    console.error(e);
    document.getElementById('clientsList').innerHTML = 'Erreur.'; 
  }
}

// Fonction pour copier le numéro
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    alert('📋 Numéro copié : ' + text);
  }).catch(err => {
    console.error('Erreur copie: ', err);
    alert('Impossible de copier le numéro.');
  });
}
// --- STATS ---
async function loadStats() {
  try {
    const res = await fetch(`${API_URL_EXTRA}/stats`); 
    const data = await res.json();
    const canvas = document.getElementById('chartTopSaveurs');
    if(!canvas) return;
    
    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.topSaveurs.map(s => s.saveur_nom),
        datasets: [{
          label: 'Quantité Vendue',
          data: data.topSaveurs.map(s => s.total_qte),
          backgroundColor: 'rgba(0, 243, 255, 0.5)',
          borderColor: '#00f3ff',
          borderWidth: 1
        }]
      },
      options: { scales: { y: { beginAtZero: true, grid: { color: '#333' } }, x: { grid: { color: '#333' } } }, plugins: { legend: { labels: { color: '#fff' } } } }
    });
  } catch(e) { console.error('Erreur stats', e); }
}

// Lancement automatique quand on change d'onglet
document.addEventListener('DOMContentLoaded', () => {
    // On attend un peu que le DOM principal soit chargé
    setTimeout(() => {
        loadCommandes();
        loadClients();
        loadStats();
    }, 500);
});


