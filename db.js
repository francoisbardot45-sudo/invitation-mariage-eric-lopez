const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const DATA_FILE = path.join(__dirname, 'data', 'rsvp.json');

const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    : null;

function storageMode() {
  return supabase ? 'supabase' : 'fichier';
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

function rowToEntry(row) {
  return migrateEntry({
    id: row.id,
    prenom: row.prenom,
    nom: row.nom,
    nomComplet: row.nom_complet,
    telephone: row.telephone,
    presence: row.presence,
    nombreAdultes: row.nombre_adultes,
    nombreEnfants: row.nombre_enfants,
    message: row.message || '',
    dateReponse: row.date_reponse,
  });
}

function entryToRow(entry) {
  return {
    id: entry.id,
    prenom: entry.prenom,
    nom: entry.nom,
    nom_complet: entry.nomComplet,
    telephone: entry.telephone,
    presence: entry.presence,
    nombre_adultes: entry.nombreAdultes,
    nombre_enfants: entry.nombreEnfants,
    message: entry.message || '',
    date_reponse: entry.dateReponse,
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
  if (supabase) {
    const { data, error } = await supabase
      .from('rsvp')
      .select('*')
      .order('date_reponse', { ascending: false });
    if (error) throw error;
    return (data || []).map(rowToEntry);
  }
  return readRsvpsFile();
}

async function insertRsvp(entry) {
  if (supabase) {
    const { error } = await supabase.from('rsvp').insert(entryToRow(entry));
    if (error) throw error;
    return;
  }
  const rsvps = readRsvpsFile();
  rsvps.push(entry);
  writeRsvpsFile(rsvps);
}

async function deleteRsvp(id) {
  if (supabase) {
    const { error } = await supabase.from('rsvp').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  writeRsvpsFile(readRsvpsFile().filter((r) => r.id !== id));
}

module.exports = {
  storageMode,
  migrateEntry,
  readRsvps,
  insertRsvp,
  deleteRsvp,
};
