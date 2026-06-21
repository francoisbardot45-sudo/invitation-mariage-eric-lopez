const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

try {
  require('dotenv').config();
} catch {
  /* dotenv optionnel */
}

const { storageMode, readRsvps, getRsvpById, insertRsvp, deleteRsvp, updateRsvp, PAGNE_PRICE } = require('./db');

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
  { prenom, nom, telephone, presence, nombreAdultes, nombreEnfants, message, pagneQuantite },
  id
) {
  const prenomTrim = prenom.trim();
  const nomTrim = nom.trim();
  const adultesRaw = presence === 'oui' ? parseInt(nombreAdultes, 10) : 0;
  const adultes = presence === 'oui' ? (adultesRaw === 0 ? 1 : Math.max(1, adultesRaw || 1)) : 0;
  const enfants = presence === 'oui' ? Math.max(0, parseInt(nombreEnfants, 10) || 0) : 0;

  let qty = 0;
  if (presence === 'oui') {
    qty = Math.max(0, Math.min(20, parseInt(pagneQuantite, 10) || 0));
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
    pagnePaiement: qty > 0 ? 'commande' : 'aucun',
    pagneDeclareDate: null,
  };
}

function buildGuestReturnMessage(entry) {
  const p = entry.prenom;
  const date = new Date(entry.dateReponse).toLocaleDateString('fr-FR');
  const qty = entry.pagneQuantite ?? 0;

  if (qty === 0) {
    return {
      title: 'Déjà inscrit(e)',
      message: `Bonjour ${p} ! Votre présence est confirmée depuis le ${date}. Nous avons hâte de vous accueillir le 15 août 2026. Eric & Lopez 💍`,
      icon: '✓',
    };
  }

  const total = (entry.pagneTotal ?? 0).toLocaleString('fr-FR');
  const status = entry.pagnePaiement;

  if (status === 'paye') {
    return {
      title: 'Merci du fond du cœur',
      message: `Bonjour ${p} ! Votre présence et le règlement de ${qty} pagne(s) (${total} FCFA) sont bien enregistrés. Merci infiniment pour votre générosité — au plaisir de vous retrouver le 15 août 2026. Eric & Lopez 💐`,
      icon: '💐',
    };
  }
  if (status === 'declare_paye') {
    return {
      title: 'Merci du fond du cœur',
      message: `Bonjour ${p} ! Votre présence est confirmée et nous avons bien reçu votre confirmation de paiement pour ${qty} pagne(s). Merci infiniment. Eric & Lopez 💐`,
      icon: '💐',
    };
  }
  if (status === 'non_recu') {
    return {
      title: 'Paiement à régulariser',
      message: `Bonjour ${p}, nous n'avons pas encore reçu votre paiement pour ${qty} pagne(s) (${total} FCFA). Merci de nous contacter au ${WAVE_PHONE_DISPLAY} ou de refaire votre dépôt en indiquant votre nom.`,
      icon: '📞',
      showPagne: true,
    };
  }
  return {
    title: 'Déjà inscrit(e)',
    message: `Bonjour ${p} ! Votre présence est confirmée depuis le ${date}. Il reste le règlement de ${qty} pagne(s) (${total} FCFA) si ce n'est pas encore fait.`,
    icon: '✓',
    showPagne: true,
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
      const info = buildGuestReturnMessage(duplicate);
      return res.status(409).json({
        duplicate: true,
        error: info.message,
        title: info.title,
        icon: info.icon,
        showPagne: info.showPagne ?? false,
        id: duplicate.id,
        telephone: duplicate.telephone,
        pagne:
          (duplicate.pagneQuantite ?? 0) > 0
            ? {
                quantite: duplicate.pagneQuantite,
                total: duplicate.pagneTotal,
                paiement: duplicate.pagnePaiement,
              }
            : null,
      });
    }

    const entry = buildEntry(req.body);
    await insertRsvp(entry);

    let message =
      'Votre présence nous fait chaleureusement plaisir. Nous avons hâte de vous retrouver le 15 août 2026. Eric & Lopez 💍';
    if (entry.pagneQuantite > 0) {
      message =
        'Merci du fond du cœur ! Votre commande de pagnes est enregistrée. Vous trouverez le numéro de paiement ci-dessous.';
    }

    res.json({
      success: true,
      message,
      id: entry.id,
      telephone: entry.telephone,
      pagne: entry.pagneQuantite > 0
        ? { quantite: entry.pagneQuantite, total: entry.pagneTotal, paiement: entry.pagnePaiement }
        : null,
    });
  } catch (err) {
    handleError(res, err);
  }
});

app.post('/api/rsvp/:id/declare-paiement', async (req, res) => {
  try {
    const { telephone } = req.body;
    if (!telephone?.trim()) {
      return res.status(400).json({ error: 'Numéro de téléphone requis.' });
    }

    const entry = await getRsvpById(req.params.id);
    if (!entry) {
      return res.status(404).json({ error: 'Réponse introuvable.' });
    }
    if (normalizePhone(entry.telephone) !== normalizePhone(telephone)) {
      return res.status(403).json({ error: 'Numéro de téléphone incorrect.' });
    }
    if ((entry.pagneQuantite ?? 0) === 0) {
      return res.status(400).json({ error: 'Aucune commande de pagne.' });
    }
    if (entry.pagnePaiement === 'paye') {
      return res.json({
        success: true,
        already: true,
        message:
          'Votre paiement est déjà enregistré. Merci infiniment pour votre générosité. Eric & Lopez 💐',
      });
    }
    if (entry.pagnePaiement === 'declare_paye') {
      return res.json({
        success: true,
        already: true,
        message:
          'Nous avons déjà bien reçu votre confirmation. Merci du fond du cœur. Eric & Lopez 💐',
      });
    }

    await updateRsvp(entry.id, {
      pagnePaiement: 'declare_paye',
      pagneDeclareDate: new Date().toISOString(),
    });

    res.json({
      success: true,
      message:
        'Merci infiniment ! Votre confirmation nous est bien parvenue. Eric & Lopez vous remercient chaleureusement. 💐',
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
  });
});

app.patch('/api/rsvp/:id/pagne', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Accès non autorisé.' });
  }
  try {
    const { pagnePaiement } = req.body;
    const allowed = ['aucun', 'commande', 'declare_paye', 'paye', 'non_recu', 'wave', 'plus_tard'];
    if (!allowed.includes(pagnePaiement)) {
      return res.status(400).json({ error: 'Statut de paiement invalide.' });
    }
    const fields = { pagnePaiement };
    if (pagnePaiement === 'paye') fields.pagnePayeDate = new Date().toISOString();
    if (pagnePaiement === 'non_recu') fields.pagneNonRecuDate = new Date().toISOString();
    await updateRsvp(req.params.id, fields);
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
