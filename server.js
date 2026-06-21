const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'rsvp.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'mariage2026';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'mariage-secret-2026';
const ADMIN_PATH = process.env.ADMIN_PATH || 'gestion-eric-lopez-2026';

const ADMIN_TOKEN = crypto.createHmac('sha256', ADMIN_SECRET).update('admin-session').digest('hex');
const ADMIN_DIR = path.join(__dirname, 'admin');

app.use(express.json());

function parseCookies(req) {
  const cookies = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const [key, ...rest] = part.trim().split('=');
    if (key) cookies[key] = decodeURIComponent(rest.join('='));
  });
  return cookies;
}

function isAdmin(req) {
  return parseCookies(req).admin_token === ADMIN_TOKEN;
}

function readRsvps() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch {
    /* fichier corrompu ou absent */
  }
  return [];
}

function writeRsvps(rsvps) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(rsvps, null, 2), 'utf8');
}

function normalizeText(str) {
  return (str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizePhone(tel) {
  return (tel || '').replace(/\D/g, '');
}

function findDuplicate(rsvps, nom, prenom, telephone) {
  const nNom = normalizeText(nom);
  const nPrenom = normalizeText(prenom);
  const nTel = normalizePhone(telephone);

  return rsvps.find((r) => {
    const sameName = normalizeText(r.nom) === nNom && normalizeText(r.prenom) === nPrenom;
    const samePhone = nTel.length >= 8 && normalizePhone(r.telephone) === nTel;
    return sameName || samePhone;
  });
}

function migrateEntry(entry) {
  if (!entry.telephone && entry.email) {
    entry.telephone = entry.email;
    delete entry.email;
  }
  if (!entry.nomComplet) {
    entry.nomComplet = `${entry.nom || ''} ${entry.prenom || ''}`.trim();
  }
  if (entry.nombreAdultes === undefined) {
    entry.nombreAdultes = entry.nombrePersonnes ?? (entry.presence === 'oui' ? 1 : 0);
  }
  if (entry.nombreEnfants === undefined) {
    entry.nombreEnfants = 0;
  }
  return entry;
}

function buildEntry({ prenom, nom, telephone, presence, nombreAdultes, nombreEnfants, message }, id) {
  const prenomTrim = prenom.trim();
  const nomTrim = nom.trim();
  const adultesRaw = presence === 'oui' ? parseInt(nombreAdultes, 10) : 0;
  const adultes = presence === 'oui' ? (adultesRaw === 0 ? 1 : Math.max(1, adultesRaw || 1)) : 0;
  const enfants = presence === 'oui' ? Math.max(0, parseInt(nombreEnfants, 10) || 0) : 0;

  return {
    id: id || Date.now().toString(),
    prenom: prenomTrim,
    nom: nomTrim,
    nomComplet: `${nomTrim} ${prenomTrim}`,
    telephone: telephone.trim(),
    presence,
    nombreAdultes: adultes,
    nombreEnfants: enfants,
    message: message?.trim() || '',
    dateReponse: new Date().toISOString(),
  };
}

function validateRsvpInput({ prenom, nom, telephone, presence }) {
  if (!prenom?.trim() || !nom?.trim()) {
    return 'Le prénom et le nom sont obligatoires.';
  }
  if (!telephone?.trim()) {
    return 'Le numéro de téléphone est obligatoire.';
  }
  if (!['oui', 'non'].includes(presence)) {
    return 'Veuillez confirmer votre présence.';
  }
  return null;
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Mot de passe incorrect.' });
  }
  res.setHeader(
    'Set-Cookie',
    `admin_token=${ADMIN_TOKEN}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}`
  );
  res.json({ success: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'admin_token=; Path=/; HttpOnly; Max-Age=0');
  res.json({ success: true });
});

app.get('/api/admin/check', (req, res) => {
  res.json({ authenticated: isAdmin(req) });
});

app.post('/api/rsvp', (req, res) => {
  const error = validateRsvpInput(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const rsvps = readRsvps();
  const duplicate = findDuplicate(rsvps, req.body.nom, req.body.prenom, req.body.telephone);

  if (duplicate) {
    return res.status(409).json({
      duplicate: true,
      error: `Bonjour ${duplicate.prenom}, vous êtes déjà inscrit(e) ! Votre présence a bien été enregistrée le ${new Date(duplicate.dateReponse).toLocaleDateString('fr-FR')}.`,
    });
  }

  const entry = buildEntry(req.body);
  rsvps.push(entry);
  writeRsvps(rsvps);

  res.json({ success: true, message: 'Merci ! Votre réponse a bien été enregistrée.' });
});

app.post('/api/rsvp/import', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Accès non autorisé.' });
  }

  const { entries } = req.body;
  if (!Array.isArray(entries) || !entries.length) {
    return res.status(400).json({ error: 'Aucune entrée à importer.' });
  }

  const rsvps = readRsvps();
  let imported = 0;
  let skipped = 0;
  const skippedRows = [];

  entries.forEach((raw, index) => {
    const nom = raw.nom?.trim();
    const prenom = raw.prenom?.trim();
    const telephone = raw.telephone?.trim();
    const presence = raw.presence === 'non' ? 'non' : 'oui';

    if (!nom || !prenom || !telephone) {
      skipped++;
      skippedRows.push({ line: index + 1, reason: 'Données incomplètes' });
      return;
    }

    if (findDuplicate(rsvps, nom, prenom, telephone)) {
      skipped++;
      skippedRows.push({ line: index + 1, name: `${nom} ${prenom}`, reason: 'Doublon' });
      return;
    }

    const entry = buildEntry(
      {
        nom,
        prenom,
        telephone,
        presence,
        nombreAdultes: raw.nombreAdultes ?? raw.adultes ?? 1,
        nombreEnfants: raw.nombreEnfants ?? raw.enfants ?? 0,
        message: raw.message || '',
      },
      `${Date.now()}-${index}`
    );

    rsvps.push(entry);
    imported++;
  });

  writeRsvps(rsvps);
  res.json({ imported, skipped, skippedRows });
});

app.get('/api/rsvp', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Accès non autorisé.' });
  }
  res.json(readRsvps().map(migrateEntry));
});

app.delete('/api/rsvp/:id', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Accès non autorisé.' });
  }
  const rsvps = readRsvps().filter((r) => r.id !== req.params.id);
  writeRsvps(rsvps);
  res.json({ success: true });
});

function serveAdminPage(_req, res) {
  const html = fs.readFileSync(path.join(ADMIN_DIR, 'index.html'), 'utf8')
    .replaceAll('__ADMIN_BASE__', `/${ADMIN_PATH}`);
  res.type('html').send(html);
}

app.get(`/${ADMIN_PATH}`, serveAdminPage);
app.get(`/${ADMIN_PATH}/`, serveAdminPage);

app.get(`/${ADMIN_PATH}/admin.css`, (_req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'admin.css'));
});

app.get(`/${ADMIN_PATH}/admin.js`, (_req, res) => {
  res.sendFile(path.join(ADMIN_DIR, 'admin.js'));
});

app.get('/admin.html', (_req, res) => {
  res.status(404).send('Page introuvable.');
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`\n💍 Invitation : http://localhost:${PORT}`);
  console.log(`🔐 Espace admin (privé) : http://localhost:${PORT}/${ADMIN_PATH}`);
  console.log(`   Mot de passe : ${ADMIN_PASSWORD}\n`);
});
