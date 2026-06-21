const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const DATA_FILE = path.join(__dirname, 'data', 'rsvp.json');
const COLLECTION = 'rsvps';
const PAGNE_PRICE = parseInt(process.env.PAGNE_PRICE || '2500', 10);

let firestore = null;

function getFirebaseCert() {
  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    };
  }

  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(__dirname, 'firebase-service-account.json');

  if (fs.existsSync(credPath)) {
    const sa = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    return {
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    };
  }

  return null;
}

function initFirebase() {
  if (firestore) return firestore;

  const cert = getFirebaseCert();

  if (!cert) {
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '⚠️  Clé Firebase manquante — les données ne seront PAS sauvegardées de façon permanente.'
      );
    }
    return null;
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(cert),
    });
  }
  firestore = admin.firestore();
  return firestore;
}

function storageMode() {
  try {
    return initFirebase() ? 'firebase' : 'fichier';
  } catch {
    return 'fichier';
  }
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
  if (entry.pagneQuantite === undefined) entry.pagneQuantite = 0;
  if (entry.pagnePrixUnitaire === undefined) entry.pagnePrixUnitaire = PAGNE_PRICE;
  if (entry.pagneTotal === undefined) entry.pagneTotal = entry.pagneQuantite * PAGNE_PRICE;
  if (entry.pagnePaiement === undefined || entry.pagnePaiement === 'wave' || entry.pagnePaiement === 'plus_tard') {
    entry.pagnePaiement = entry.pagneQuantite > 0 ? 'commande' : 'aucun';
  }
  return entry;
}

function docToEntry(id, data) {
  return migrateEntry({
    id,
    prenom: data.prenom,
    nom: data.nom,
    nomComplet: data.nomComplet,
    telephone: data.telephone,
    presence: data.presence,
    nombreAdultes: data.nombreAdultes,
    nombreEnfants: data.nombreEnfants,
    message: data.message || '',
    dateReponse: data.dateReponse,
    pagneQuantite: data.pagneQuantite ?? 0,
    pagnePrixUnitaire: data.pagnePrixUnitaire ?? PAGNE_PRICE,
    pagneTotal: data.pagneTotal ?? 0,
    pagnePaiement: data.pagnePaiement ?? 'aucun',
    pagneDeclareDate: data.pagneDeclareDate || null,
  });
}

function entryToDoc(entry) {
  return {
    prenom: entry.prenom,
    nom: entry.nom,
    nomComplet: entry.nomComplet,
    telephone: entry.telephone,
    presence: entry.presence,
    nombreAdultes: entry.nombreAdultes,
    nombreEnfants: entry.nombreEnfants,
    message: entry.message || '',
    dateReponse: entry.dateReponse,
    pagneQuantite: entry.pagneQuantite ?? 0,
    pagnePrixUnitaire: entry.pagnePrixUnitaire ?? PAGNE_PRICE,
    pagneTotal: entry.pagneTotal ?? 0,
    pagnePaiement: entry.pagnePaiement ?? 'aucun',
    pagneDeclareDate: entry.pagneDeclareDate || null,
  };
}

function readRsvpsFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).map(migrateEntry);
    }
  } catch {
    /* ignore */
  }
  return [];
}

function writeRsvpsFile(rsvps) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(rsvps, null, 2), 'utf8');
}

async function readRsvps() {
  const db = initFirebase();
  if (db) {
    const snap = await db.collection(COLLECTION).orderBy('dateReponse', 'desc').get();
    return snap.docs.map((doc) => docToEntry(doc.id, doc.data()));
  }
  return readRsvpsFile();
}

async function insertRsvp(entry) {
  const db = initFirebase();
  if (db) {
    await db.collection(COLLECTION).doc(entry.id).set(entryToDoc(entry));
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Firebase non configuré — enregistrement refusé.');
  }
  const rsvps = readRsvpsFile();
  rsvps.push(entry);
  writeRsvpsFile(rsvps);
}

async function deleteRsvp(id) {
  const db = initFirebase();
  if (db) {
    await db.collection(COLLECTION).doc(id).delete();
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Firebase non configuré.');
  }
  writeRsvpsFile(readRsvpsFile().filter((r) => r.id !== id));
}

async function updateRsvp(id, fields) {
  const db = initFirebase();
  if (db) {
    await db.collection(COLLECTION).doc(id).update(fields);
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Firebase non configuré.');
  }
  const rsvps = readRsvpsFile();
  const idx = rsvps.findIndex((r) => r.id === id);
  if (idx >= 0) {
    rsvps[idx] = migrateEntry({ ...rsvps[idx], ...fields });
    writeRsvpsFile(rsvps);
  }
}

async function getRsvpById(id) {
  const db = initFirebase();
  if (db) {
    const doc = await db.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return docToEntry(doc.id, doc.data());
  }
  return readRsvpsFile().find((r) => r.id === id) || null;
}

module.exports = {
  storageMode,
  migrateEntry,
  readRsvps,
  getRsvpById,
  insertRsvp,
  deleteRsvp,
  updateRsvp,
  PAGNE_PRICE,
};
