const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

try {
  require('dotenv').config();
} catch {
  /* dotenv optionnel */
}

const { storageMode, readRsvps, insertRsvp, deleteRsvp, updateRsvp, PAGNE_PRICE } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'mariage2026';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'mariage-secret-2026';
const ADMIN_PATH = process.env.ADMIN_PATH || 'gestion-eric-lopez-2026';

const WAVE_PHONE = process.env.WAVE_PHONE || '+2250708020626';
const WAVE_PHONE_DISPLAY = process.env.WAVE_PHONE_DISPLAY || '07 08 02 06 26';

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

function buildEntry(
  { prenom, nom, telephone, presence, nombreAdultes, nombreEnfants, message, pagneQuantite, pagnePaiement },
  id
) {
  const prenomTrim = prenom.trim();
  const nomTrim = nom.trim();
  const adultesRaw = presence === 'oui' ? parseInt(nombreAdultes, 10) : 0;
  const adultes = presence === 'oui' ? (adultesRaw === 0 ? 1 : Math.max(1, adultesRaw || 1)) : 0;
  const enfants = presence === 'oui' ? Math.max(0, parseInt(nombreEnfants, 10) || 0) : 0;

  let qty = 0;
  let paiement = 'aucun';
  if (presence === 'oui') {
    qty = Math.max(0, Math.min(20, parseInt(pagneQuantite, 10) || 0));
    if (qty > 0) {
      const allowed = ['wave', 'plus_tard'];
      paiement = allowed.includes(pagnePaiement) ? pagnePaiement : 'plus_tard';
    }
  }

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
    pagneQuantite: qty,
    pagnePrixUnitaire: PAGNE_PRICE,
    pagneTotal: qty * PAGNE_PRICE,
    pagnePaiement: qty > 0 ? paiement : 'aucun',
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

function handleError(res, err) {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur. Réessayez dans un instant.' });
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

app.post('/api/rsvp', async (req, res) => {
  try {
    const error = validateRsvpInput(req.body);
    if (error) return res.status(400).json({ error });

    const rsvps = await readRsvps();
    const duplicate = findDuplicate(rsvps, req.body.nom, req.body.prenom, req.body.telephone);

    if (duplicate) {
      return res.status(409).json({
        duplicate: true,
        error: `Bonjour ${duplicate.prenom}, vous êtes déjà inscrit(e) ! Votre présence a bien été enregistrée le ${new Date(duplicate.dateReponse).toLocaleDateString('fr-FR')}.`,
      });
    }

    const entry = buildEntry(req.body);
    await insertRsvp(entry);

    let message = 'Merci ! Votre réponse a bien été enregistrée.';
    if (entry.pagneQuantite > 0) {
      message =
        entry.pagnePaiement === 'wave'
          ? `Merci ! Votre réponse et votre commande de ${entry.pagneQuantite} pagne(s) sont enregistrées. Procédez au paiement Wave ci-dessous.`
          : `Merci ! Votre réponse et votre commande de ${entry.pagneQuantite} pagne(s) sont enregistrées. Vous pourrez régler plus tard.`;
    }

    res.json({
      success: true,
      message,
      pagne: entry.pagneQuantite > 0
        ? { quantite: entry.pagneQuantite, total: entry.pagneTotal, paiement: entry.pagnePaiement }
        : null,
    });
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/api/rsvp/import', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Accès non autorisé.' });
  }

  try {
    const { entries } = req.body;
    if (!Array.isArray(entries) || !entries.length) {
      return res.status(400).json({ error: 'Aucune entrée à importer.' });
    }

    let rsvps = await readRsvps();
    let imported = 0;
    let skipped = 0;
    const skippedRows = [];

    for (let index = 0; index < entries.length; index++) {
      const raw = entries[index];
      const nom = raw.nom?.trim();
      const prenom = raw.prenom?.trim();
      const telephone = raw.telephone?.trim();
      const presence = raw.presence === 'non' ? 'non' : 'oui';

      if (!nom || !prenom || !telephone) {
        skipped++;
        skippedRows.push({ line: index + 1, reason: 'Données incomplètes' });
        continue;
      }

      if (findDuplicate(rsvps, nom, prenom, telephone)) {
        skipped++;
        skippedRows.push({ line: index + 1, name: `${nom} ${prenom}`, reason: 'Doublon' });
        continue;
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
          pagneQuantite: raw.pagneQuantite ?? raw.pagne ?? 0,
          pagnePaiement: raw.pagnePaiement || 'aucun',
        },
        `${Date.now()}-${index}`
      );

      await insertRsvp(entry);
      rsvps.push(entry);
      imported++;
    }

    res.json({ imported, skipped, skippedRows });
  } catch (err) {
    handleError(res, err);
  }
});

app.get('/api/rsvp', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Accès non autorisé.' });
  }
  try {
    res.json(await readRsvps());
  } catch (err) {
    handleError(res, err);
  }
});

app.get('/api/config', (_req, res) => {
  res.json({
    pagnePrice: PAGNE_PRICE,
    wavePhone: WAVE_PHONE_DISPLAY,
    wavePhoneDial: WAVE_PHONE,
    wavePaymentLink: process.env.WAVE_PAYMENT_LINK || '',
    waveMerchantName: process.env.WAVE_MERCHANT_NAME || 'Eric & Lopez',
  });
});

app.patch('/api/rsvp/:id/pagne', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Accès non autorisé.' });
  }
  try {
    const { pagnePaiement } = req.body;
    const allowed = ['aucun', 'wave', 'plus_tard', 'paye'];
    if (!allowed.includes(pagnePaiement)) {
      return res.status(400).json({ error: 'Statut de paiement invalide.' });
    }
    await updateRsvp(req.params.id, { pagnePaiement });
    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
});

app.delete('/api/rsvp/:id', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Accès non autorisé.' });
  }
  try {
    await deleteRsvp(req.params.id);
    res.json({ success: true });
  } catch (err) {
    handleError(res, err);
  }
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

if (require.main === module) {
  app.listen(PORT, () => {
    const mode = storageMode();
    console.log(`\n💍 Invitation : http://localhost:${PORT}`);
    console.log(`🔐 Espace admin : http://localhost:${PORT}/${ADMIN_PATH}`);
    console.log(`📦 Stockage : ${mode === 'firebase' ? 'Firebase Firestore (permanent)' : 'fichier local (temporaire — ne pas utiliser en production)'}`);
    if (mode !== 'firebase') {
      console.log('⚠️  Configurez Firebase ou lancez via Cloud Functions pour un stockage permanent.\n');
    }
  });
}

module.exports = app;
