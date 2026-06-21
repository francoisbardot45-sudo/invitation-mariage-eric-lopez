const intro = document.getElementById('intro');
const page = document.getElementById('page');
const openBtn = document.getElementById('open-invite');
const form = document.getElementById('rsvp-form');
const successEl = document.getElementById('success');
const formError = document.getElementById('form-error');
const submitBtn = document.getElementById('submit-btn');
const guestsField = document.getElementById('guests-field');
const pagneField = document.getElementById('pagne-field');
const pagneQuantite = document.getElementById('pagneQuantite');
const pagneTotal = document.getElementById('pagne-total');
const pagnePayInfo = document.getElementById('pagne-pay-info');
const wavePhoneDisplay = document.getElementById('wave-phone-display');
const successPagne = document.getElementById('success-pagne');

let siteConfig = { pagnePrice: 2500, wavePhone: '07 08 02 06 26' };
let lastRsvp = null;

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      siteConfig = { ...siteConfig, ...(await res.json()) };
      const label = document.getElementById('pagne-price-label');
      if (label) {
        label.textContent = `${siteConfig.pagnePrice.toLocaleString('fr-FR')} FCFA / pagne`;
      }
      if (wavePhoneDisplay && siteConfig.wavePhone) {
        wavePhoneDisplay.textContent = siteConfig.wavePhone;
      }
    }
  } catch {
    /* config optionnelle */
  }
}

loadConfig();

function openInvitation() {
  intro.classList.add('hidden');
  page.hidden = false;
  initPetals();
  initReveal();
  initScrollHint();
}

openBtn.addEventListener('click', openInvitation);

function initPetals() {
  const container = document.getElementById('petals');
  const symbols = ['✿', '❀', '♥', '✦'];
  for (let i = 0; i < 18; i++) {
    const el = document.createElement('span');
    el.className = 'petal';
    el.textContent = symbols[i % symbols.length];
    el.style.left = `${Math.random() * 100}%`;
    el.style.animationDuration = `${8 + Math.random() * 12}s`;
    el.style.animationDelay = `${Math.random() * 10}s`;
    el.style.fontSize = `${0.6 + Math.random() * 0.8}rem`;
    container.appendChild(el);
  }
}

function initReveal() {
  const items = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    },
    { threshold: 0.12 }
  );
  items.forEach((el, i) => {
    el.style.transitionDelay = `${i * 0.08}s`;
    observer.observe(el);
  });
}

function updatePagneUI() {
  const qty = parseInt(pagneQuantite.value, 10) || 0;
  const total = qty * siteConfig.pagnePrice;
  pagneTotal.hidden = qty === 0;
  pagneTotal.innerHTML = `Total : <strong>${total.toLocaleString('fr-FR')} FCFA</strong>`;
  pagnePayInfo.hidden = qty === 0;
}

function togglePresencePanels() {
  const oui = form.querySelector('input[name="presence"][value="oui"]')?.checked;
  guestsField.hidden = !oui;
  pagneField.hidden = !oui;
  if (!oui) {
    pagneQuantite.value = '0';
    updatePagneUI();
  }
}

document.querySelectorAll('input[name="presence"]').forEach((radio) => {
  radio.addEventListener('change', togglePresencePanels);
});

pagneQuantite.addEventListener('change', updatePagneUI);

async function copyPhone(btn) {
  if (!siteConfig.wavePhone) return;
  try {
    await navigator.clipboard.writeText(siteConfig.wavePhone);
    const prev = btn.textContent;
    btn.textContent = 'Copié !';
    setTimeout(() => { btn.textContent = prev; }, 2000);
  } catch {
    alert(siteConfig.wavePhone);
  }
}

document.getElementById('btn-copy-wave')?.addEventListener('click', (e) => copyPhone(e.currentTarget));
document.getElementById('btn-copy-phone-success')?.addEventListener('click', (e) => copyPhone(e.currentTarget));

function initScrollHint() {
  const hint = document.getElementById('scroll-hint');
  const rsvp = document.getElementById('rsvp');
  if (!hint || !rsvp) return;
  const observer = new IntersectionObserver(
    ([entry]) => { hint.classList.toggle('hidden', entry.isIntersecting); },
    { threshold: 0.15 }
  );
  observer.observe(rsvp);
  hint.addEventListener('click', () => hint.classList.add('hidden'));
}

function showThankYouCard(message) {
  const thankYou = document.getElementById('success-thankyou');
  const thankYouText = document.getElementById('success-thankyou-text');
  const payBlock = document.getElementById('success-pagne-pay-block');

  if (payBlock) payBlock.hidden = true;
  thankYou.hidden = false;
  thankYouText.textContent = message;
}

function setupDeclareButton(pagne, canDeclare) {
  const declareBtn = document.getElementById('btn-declare-paid');
  const thankYou = document.getElementById('success-thankyou');
  const payBlock = document.getElementById('success-pagne-pay-block');

  if (!pagne) {
    successPagne.hidden = true;
    return;
  }

  successPagne.hidden = false;
  document.getElementById('success-pagne-amount').textContent =
    `${pagne.quantite} pagne(s) — ${pagne.total.toLocaleString('fr-FR')} FCFA`;
  document.getElementById('success-pagne-phone').textContent = siteConfig.wavePhone || '';

  const alreadyDone = ['declare_paye', 'paye'].includes(pagne.paiement);
  if (alreadyDone) {
    if (payBlock) payBlock.hidden = true;
    thankYou.hidden = false;
    document.getElementById('success-thankyou-text').textContent =
      pagne.paiement === 'paye'
        ? 'Merci infiniment pour votre générosité. Eric & Lopez 💐'
        : 'Merci infiniment ! Eric & Lopez vous remercient chaleureusement. 💐';
    return;
  }

  if (payBlock) payBlock.hidden = false;
  thankYou.hidden = true;
  declareBtn.hidden = !canDeclare;
  declareBtn.disabled = false;
  declareBtn.textContent = "J'ai effectué le paiement";

  if (!canDeclare) return;

  declareBtn.onclick = async () => {
    if (!lastRsvp?.id) return;
    declareBtn.disabled = true;
    declareBtn.textContent = 'Un instant...';
    try {
      const res = await fetch(`/api/rsvp/${lastRsvp.id}/declare-paiement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telephone: lastRsvp.telephone }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Erreur');
      showThankYouCard(result.message);
    } catch (err) {
      declareBtn.disabled = false;
      declareBtn.textContent = "J'ai effectué le paiement";
      alert(err.message);
    }
  };
}

function showSuccessScreen({ title, message, icon, pagne, id, telephone, showPagne }) {
  form.hidden = true;
  document.querySelector('.rsvp-header').hidden = true;
  document.getElementById('success-icon').textContent = icon || '💍';
  document.getElementById('success-title').textContent = title || 'Merci du fond du cœur';
  document.getElementById('success-message').textContent = message;
  successEl.hidden = false;

  if (pagne && showPagne !== false && !['paye', 'declare_paye'].includes(pagne.paiement)) {
    lastRsvp = { id, telephone };
    setupDeclareButton(pagne, true);
  } else if (pagne && ['paye', 'declare_paye'].includes(pagne.paiement)) {
    lastRsvp = { id, telephone };
    setupDeclareButton(pagne, false);
  } else {
    successPagne.hidden = true;
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.hidden = true;

  const qty = parseInt(pagneQuantite.value, 10) || 0;
  const data = {
    prenom: form.prenom.value,
    nom: form.nom.value,
    telephone: form.telephone.value,
    presence: form.presence.value,
    nombreAdultes: form.nombreAdultes?.value ?? '0',
    nombreEnfants: form.nombreEnfants?.value || '0',
    message: form.message.value,
    pagneQuantite: qty,
  };

  submitBtn.disabled = true;
  submitBtn.querySelector('.btn-text').textContent = 'Envoi en cours...';

  try {
    const res = await fetch('/api/rsvp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json();

    if (res.status === 409 && result.duplicate) {
      lastRsvp = { id: result.id, telephone: result.telephone };
      successEl.classList.add('success--duplicate');
      showSuccessScreen({
        title: result.title,
        message: result.error,
        icon: result.icon,
        pagne: result.pagne,
        id: result.id,
        telephone: result.telephone,
        showPagne: result.showPagne,
      });
      return;
    }

    if (!res.ok) throw new Error(result.error || 'Une erreur est survenue.');

    lastRsvp = { id: result.id, telephone: result.telephone || data.telephone };
    successEl.classList.remove('success--duplicate');
    showSuccessScreen({
      title: 'Merci du fond du cœur',
      message: result.message,
      icon: '💍',
      pagne: result.pagne,
      id: result.id,
      telephone: lastRsvp.telephone,
      showPagne: true,
    });
  } catch (err) {
    const isNetworkError = err.message === 'Failed to fetch' || err.name === 'TypeError';
    formError.textContent = isNetworkError
      ? 'Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.'
      : err.message;
    formError.hidden = false;
    submitBtn.disabled = false;
    submitBtn.querySelector('.btn-text').textContent = 'Envoyer ma réponse';
  }
});
