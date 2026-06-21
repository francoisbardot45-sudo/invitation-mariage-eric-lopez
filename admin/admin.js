let rsvps = [];
let currentFilter = 'all';
let searchQuery = '';
let pendingDeleteId = null;

const loginScreen = document.getElementById('login-screen');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const deleteModal = document.getElementById('delete-modal');
const modalGuestName = document.getElementById('modal-guest-name');
const modalConfirm = document.getElementById('modal-confirm');
const modalCancel = document.getElementById('modal-cancel');
const toastEl = document.getElementById('toast');
const importFile = document.getElementById('import-file');

async function checkAuth() {
  const res = await fetch('/api/admin/check');
  const data = await res.json();
  if (data.authenticated) showDashboard();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: document.getElementById('password').value }),
  });
  if (!res.ok) {
    const data = await res.json();
    loginError.textContent = data.error || 'Erreur de connexion';
    loginError.hidden = false;
    return;
  }
  showDashboard();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  dashboard.hidden = true;
  loginScreen.hidden = false;
  document.getElementById('password').value = '';
});

function showDashboard() {
  loginScreen.hidden = true;
  dashboard.hidden = false;
  loadRsvps();
}

async function loadRsvps() {
  const res = await fetch('/api/rsvp');
  if (!res.ok) {
    loginScreen.hidden = false;
    dashboard.hidden = true;
    return;
  }
  rsvps = await res.json();
  renderAll();
}

function fullName(r) {
  return r.nomComplet || `${r.nom} ${r.prenom}`;
}

function initials(r) {
  return ((r.nom?.[0] || '') + (r.prenom?.[0] || '')).toUpperCase();
}

function guestCount(r) {
  const adultes = r.nombreAdultes ?? r.nombrePersonnes ?? 0;
  const enfants = r.nombreEnfants ?? 0;
  return { adultes, enfants, total: adultes + enfants };
}

function pagneLabel(status) {
  const map = {
    aucun: '',
    wave: 'Wave en attente',
    plus_tard: 'À payer plus tard',
    paye: 'Payé ✓',
  };
  return map[status] || status;
}

function getFiltered() {
  return rsvps.filter((r) => {
    let matchFilter = true;
    if (currentFilter === 'pagne') {
      matchFilter = (r.pagneQuantite ?? 0) > 0;
    } else if (currentFilter !== 'all') {
      matchFilter = r.presence === currentFilter;
    }
    const q = searchQuery.toLowerCase();
    const name = fullName(r).toLowerCase();
    const tel = (r.telephone || '').toLowerCase();
    return matchFilter && (!q || name.includes(q) || tel.includes(q));
  });
}

function pagneStats() {
  const withPagne = rsvps.filter((r) => (r.pagneQuantite ?? 0) > 0);
  const totalPagnes = withPagne.reduce((s, r) => s + (r.pagneQuantite ?? 0), 0);
  const totalFcfa = withPagne.reduce((s, r) => s + (r.pagneTotal ?? 0), 0);
  const payes = withPagne.filter((r) => r.pagnePaiement === 'paye');
  const enAttente = withPagne.filter((r) => r.pagnePaiement !== 'paye' && r.pagnePaiement !== 'aucun');
  return { withPagne, totalPagnes, totalFcfa, payes: payes.length, enAttente: enAttente.length };
}

function renderAll() {
  const oui = rsvps.filter((r) => r.presence === 'oui');
  const non = rsvps.filter((r) => r.presence === 'non');
  const totalAdultes = oui.reduce((s, r) => s + guestCount(r).adultes, 0);
  const totalEnfants = oui.reduce((s, r) => s + guestCount(r).enfants, 0);
  const ps = pagneStats();

  document.getElementById('stats').innerHTML = `
    <div class="stat-card"><strong>${rsvps.length}</strong><span>Réponses</span></div>
    <div class="stat-card green"><strong>${oui.length}</strong><span>Confirmés</span></div>
    <div class="stat-card red"><strong>${non.length}</strong><span>Absents</span></div>
    <div class="stat-card gold"><strong>${totalAdultes + totalEnfants}</strong><span>Total invités</span></div>
    <div class="stat-card purple"><strong>${totalEnfants}</strong><span>Enfants</span></div>
    <div class="stat-card blue"><strong>${ps.totalPagnes}</strong><span>Pagnes commandés</span></div>
    <div class="stat-card wave"><strong>${ps.totalFcfa.toLocaleString('fr-FR')}</strong><span>FCFA (pagnes)</span></div>
    <div class="stat-card orange"><strong>${ps.enAttente}</strong><span>Paiements en attente</span></div>
  `;

  document.getElementById('count-all').textContent = rsvps.length;
  document.getElementById('count-oui').textContent = oui.length;
  document.getElementById('count-non').textContent = non.length;
  document.getElementById('count-pagne').textContent = ps.withPagne.length;
  renderList();
}

function renderGuestTags(r) {
  let html = '';
  if (r.presence === 'oui') {
    const { adultes, enfants } = guestCount(r);
    html += `<span class="tag tag--guests">👥 ${adultes} adulte(s)</span>`;
    if (enfants > 0) html += `<span class="tag tag--kids">🧒 ${enfants} enfant(s)</span>`;
  }
  const qty = r.pagneQuantite ?? 0;
  if (qty > 0) {
    const status = r.pagnePaiement || 'plus_tard';
    const statusClass = status === 'paye' ? 'tag--pagne-paid' : 'tag--pagne-pending';
    html += `<span class="tag tag--pagne ${statusClass}">🧵 ${qty} pagne(s) — ${(r.pagneTotal ?? 0).toLocaleString('fr-FR')} FCFA</span>`;
    html += `<span class="tag ${statusClass}">${pagneLabel(status)}</span>`;
  }
  return html;
}

function renderList() {
  const filtered = getFiltered();
  const list = document.getElementById('guest-list');
  const empty = document.getElementById('empty-msg');

  if (!rsvps.length) {
    list.innerHTML = '';
    empty.hidden = false;
    empty.textContent = 'Aucune réponse pour le moment.';
    return;
  }
  if (!filtered.length) {
    list.innerHTML = '';
    empty.hidden = false;
    empty.textContent = 'Aucun résultat pour cette recherche.';
    return;
  }

  empty.hidden = true;
  list.innerHTML = filtered.map((r, i) => `
    <article class="guest-card guest-card--${r.presence}" style="animation-delay:${i * 0.04}s">
      <div class="guest-avatar" aria-hidden="true">${escapeHtml(initials(r))}</div>
      <div class="guest-body">
        <div class="guest-top">
          <div>
            <h3 class="guest-name">${escapeHtml(fullName(r))}</h3>
            <p class="guest-phone">📞 ${escapeHtml(r.telephone || '—')}</p>
          </div>
          <span class="badge ${r.presence}">${r.presence === 'oui' ? '✓ Confirmé' : '✗ Absent'}</span>
        </div>
        <div class="guest-tags">
          ${renderGuestTags(r)}
          <span class="tag tag--date">📅 ${new Date(r.dateReponse).toLocaleString('fr-FR')}</span>
        </div>
        ${r.message ? `<blockquote class="guest-message">"${escapeHtml(r.message)}"</blockquote>` : ''}
        ${(r.pagneQuantite ?? 0) > 0 && r.pagnePaiement !== 'paye' ? `
          <button type="button" class="btn-mark-paid" data-id="${r.id}">Marquer pagne payé</button>
        ` : ''}
      </div>
      <button type="button" class="btn-delete" data-id="${r.id}" title="Supprimer">🗑</button>
    </article>
  `).join('');
}

function showToast(msg, type = 'info') {
  toastEl.textContent = msg;
  toastEl.className = `toast toast--${type}`;
  toastEl.hidden = false;
  setTimeout(() => { toastEl.hidden = true; }, 5000);
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if ((ch === ',' || ch === ';') && !inQuotes) {
      result.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];

  const header = parseCSVLine(lines[0]).map((h) => h.toLowerCase().replace(/^\ufeff/, ''));
  const col = (names) => header.findIndex((h) => names.some((n) => h.includes(n)));

  const idx = {
    nom: col(['nom']),
    prenom: col(['prénom', 'prenom']),
    tel: col(['téléphone', 'telephone', 'tel']),
    presence: col(['présence', 'presence']),
    adultes: col(['adultes']),
    enfants: col(['enfants']),
    message: col(['message']),
  };

  const start = idx.nom >= 0 || idx.prenom >= 0 ? 1 : 0;
  if (start === 0 && lines.length === 1) return [];

  return lines.slice(start).map((line) => {
    const cols = parseCSVLine(line);
    if (idx.nom >= 0) {
      return {
        nom: cols[idx.nom],
        prenom: cols[idx.prenom],
        telephone: cols[idx.tel],
        presence: cols[idx.presence]?.toLowerCase().includes('non') ? 'non' : 'oui',
        nombreAdultes: cols[idx.adultes] || '1',
        nombreEnfants: cols[idx.enfants] || '0',
        message: cols[idx.message] || '',
      };
    }
    return {
      nom: cols[1] || cols[0]?.split(' ')[0],
      prenom: cols[2] || cols[0]?.split(' ').slice(1).join(' '),
      telephone: cols[3] || '',
      presence: (cols[4] || 'oui').toLowerCase().includes('non') ? 'non' : 'oui',
      nombreAdultes: cols[5] || '1',
      nombreEnfants: cols[6] || '0',
      message: cols[7] || '',
    };
  }).filter((e) => e.nom && e.prenom);
}

async function importCSV(file) {
  const text = await file.text();
  const entries = parseCSV(text);
  if (!entries.length) {
    showToast('Fichier CSV vide ou format non reconnu.', 'error');
    return;
  }

  const res = await fetch('/api/rsvp/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  });

  const data = await res.json();
  if (!res.ok) {
    showToast(data.error || 'Erreur lors de l\'import.', 'error');
    return;
  }

  showToast(`${data.imported} invité(s) importé(s), ${data.skipped} ignoré(s) (doublons ou erreurs).`, 'success');
  loadRsvps();
}

document.getElementById('import-btn').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) importCSV(file);
  e.target.value = '';
});

function openDeleteModal(id) {
  const guest = rsvps.find((r) => r.id === id);
  if (!guest) return;
  pendingDeleteId = id;
  modalGuestName.textContent = fullName(guest);
  deleteModal.hidden = false;
  modalConfirm.disabled = false;
  modalConfirm.textContent = 'Supprimer';
  modalCancel.focus();
}

function closeDeleteModal() {
  deleteModal.hidden = true;
  pendingDeleteId = null;
}

async function confirmDelete() {
  if (!pendingDeleteId) return;
  modalConfirm.disabled = true;
  modalConfirm.textContent = 'Suppression...';
  const res = await fetch(`/api/rsvp/${pendingDeleteId}`, { method: 'DELETE' });
  if (!res.ok) {
    modalConfirm.disabled = false;
    modalConfirm.textContent = 'Supprimer';
    return;
  }
  rsvps = rsvps.filter((r) => r.id !== pendingDeleteId);
  closeDeleteModal();
  renderAll();
  showToast('Invité supprimé.', 'info');
}

document.getElementById('guest-list').addEventListener('click', async (e) => {
  const paidBtn = e.target.closest('.btn-mark-paid');
  if (paidBtn) {
    const id = paidBtn.dataset.id;
    paidBtn.disabled = true;
    const res = await fetch(`/api/rsvp/${id}/pagne`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagnePaiement: 'paye' }),
    });
    if (res.ok) {
      const guest = rsvps.find((r) => r.id === id);
      if (guest) guest.pagnePaiement = 'paye';
      renderAll();
      showToast('Pagne marqué comme payé.', 'success');
    } else {
      paidBtn.disabled = false;
      showToast('Erreur lors de la mise à jour.', 'error');
    }
    return;
  }
  const btn = e.target.closest('.btn-delete');
  if (btn) openDeleteModal(btn.dataset.id);
});

modalCancel.addEventListener('click', closeDeleteModal);
modalConfirm.addEventListener('click', confirmDelete);
deleteModal.addEventListener('click', (e) => { if (e.target === deleteModal) closeDeleteModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !deleteModal.hidden) closeDeleteModal(); });

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    renderList();
  });
});

document.getElementById('search').addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderList();
});

document.getElementById('export-btn').addEventListener('click', () => {
  const header = ['Nom complet', 'Nom', 'Prénom', 'Téléphone', 'Présence', 'Adultes', 'Enfants', 'Pagnes', 'Total pagne FCFA', 'Paiement pagne', 'Message', 'Date'];
  const lines = rsvps.map((r) => {
    const { adultes, enfants } = guestCount(r);
    return [
      fullName(r), r.nom, r.prenom, r.telephone || '', r.presence, adultes, enfants,
      r.pagneQuantite ?? 0, r.pagneTotal ?? 0, pagneLabel(r.pagnePaiement || 'aucun'),
      r.message, r.dateReponse,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  const blob = new Blob(['\ufeff' + header.join(',') + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'rsvp-mariage.csv';
  a.click();
});

checkAuth();
