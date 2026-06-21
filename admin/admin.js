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

async function checkAuth() {
  const res = await fetch('/api/admin/check');
  const data = await res.json();
  if (data.authenticated) {
    showDashboard();
  }
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

function guestCount(r) {
  const adultes = r.nombreAdultes ?? r.nombrePersonnes ?? 0;
  const enfants = r.nombreEnfants ?? 0;
  return { adultes, enfants, total: adultes + enfants };
}

function getFiltered() {
  return rsvps.filter((r) => {
    const matchFilter = currentFilter === 'all' || r.presence === currentFilter;
    const q = searchQuery.toLowerCase();
    const name = fullName(r).toLowerCase();
    const tel = (r.telephone || '').toLowerCase();
    const matchSearch = !q || name.includes(q) || tel.includes(q);
    return matchFilter && matchSearch;
  });
}

function renderAll() {
  const oui = rsvps.filter((r) => r.presence === 'oui');
  const non = rsvps.filter((r) => r.presence === 'non');
  const totalAdultes = oui.reduce((s, r) => s + guestCount(r).adultes, 0);
  const totalEnfants = oui.reduce((s, r) => s + guestCount(r).enfants, 0);

  document.getElementById('stats').innerHTML = `
    <div class="stat-card"><strong>${rsvps.length}</strong><span>Réponses</span></div>
    <div class="stat-card green"><strong>${oui.length}</strong><span>Confirmés</span></div>
    <div class="stat-card red"><strong>${non.length}</strong><span>Absents</span></div>
    <div class="stat-card gold"><strong>${totalAdultes + totalEnfants}</strong><span>Total invités</span></div>
    <div class="stat-card"><strong>${totalEnfants}</strong><span>Enfants</span></div>
  `;

  document.getElementById('count-all').textContent = rsvps.length;
  document.getElementById('count-oui').textContent = oui.length;
  document.getElementById('count-non').textContent = non.length;

  renderList();
}

function renderGuestMeta(r) {
  if (r.presence !== 'oui') return '';
  const { adultes, enfants } = guestCount(r);
  let parts = [`${adultes} adulte(s)`];
  if (enfants > 0) parts.push(`${enfants} enfant(s)`);
  return parts.join(' · ') + ' · ';
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
  list.innerHTML = filtered.map((r) => `
    <div class="guest-card" data-id="${r.id}">
      <div class="guest-fullname">${escapeHtml(fullName(r))}</div>
      <div class="guest-actions">
        <span class="badge ${r.presence}">${r.presence === 'oui' ? '✓ Confirmé' : '✗ Absent'}</span>
        <button type="button" class="btn-delete" data-id="${r.id}" title="Supprimer">🗑</button>
      </div>
      <div class="guest-meta">
        ${r.telephone ? '📞 ' + escapeHtml(r.telephone) + ' · ' : ''}
        ${renderGuestMeta(r)}
        ${new Date(r.dateReponse).toLocaleString('fr-FR')}
      </div>
      ${r.message ? `<div class="guest-message">"${escapeHtml(r.message)}"</div>` : ''}
    </div>
  `).join('');
}

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
    modalGuestName.textContent = 'Erreur — réessayez';
    return;
  }

  rsvps = rsvps.filter((r) => r.id !== pendingDeleteId);
  closeDeleteModal();
  renderAll();
}

document.getElementById('guest-list').addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-delete');
  if (btn) openDeleteModal(btn.dataset.id);
});

modalCancel.addEventListener('click', closeDeleteModal);
modalConfirm.addEventListener('click', confirmDelete);

deleteModal.addEventListener('click', (e) => {
  if (e.target === deleteModal) closeDeleteModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !deleteModal.hidden) closeDeleteModal();
});

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
  const header = ['Nom complet', 'Nom', 'Prénom', 'Téléphone', 'Présence', 'Adultes', 'Enfants', 'Message', 'Date'];
  const lines = rsvps.map((r) => {
    const { adultes, enfants } = guestCount(r);
    return [fullName(r), r.nom, r.prenom, r.telephone || '', r.presence, adultes, enfants, r.message, r.dateReponse]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',');
  });
  const blob = new Blob([header.join(',') + '\n' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'rsvp-mariage.csv';
  a.click();
});

checkAuth();
