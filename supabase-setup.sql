-- Exécuter dans Supabase : SQL Editor → New query → Run

CREATE TABLE IF NOT EXISTS rsvp (
  id TEXT PRIMARY KEY,
  prenom TEXT NOT NULL,
  nom TEXT NOT NULL,
  nom_complet TEXT NOT NULL,
  telephone TEXT NOT NULL,
  presence TEXT NOT NULL CHECK (presence IN ('oui', 'non')),
  nombre_adultes INTEGER NOT NULL DEFAULT 0,
  nombre_enfants INTEGER NOT NULL DEFAULT 0,
  message TEXT DEFAULT '',
  date_reponse TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rsvp_nom ON rsvp (nom, prenom);
CREATE INDEX IF NOT EXISTS idx_rsvp_telephone ON rsvp (telephone);
