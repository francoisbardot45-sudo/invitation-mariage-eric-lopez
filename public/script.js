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
const pagnePayment = document.getElementById('pagne-payment');
const wavePreview = document.getElementById('wave-preview');
const wavePhoneDisplay = document.getElementById('wave-phone-display');
const successWave = document.getElementById('success-wave');

let siteConfig = {
  pagnePrice: 2500,
  wavePhone: '07 08 02 06 26',
  wavePhoneDial: '+2250708020626',
  wavePaymentLink: '',
  waveMerchantName: 'Eric & Lopez',
};

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
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
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
  pagnePayment.hidden = qty === 0;

  if (qty > 0) {
    const waveRadio = form.querySelector('input[name="pagnePaiement"][value="wave"]');
    const laterRadio = form.querySelector('input[name="pagnePaiement"][value="plus_tard"]');
    if (!waveRadio.checked && !laterRadio.checked) {
      waveRadio.checked = true;
    }
    updateWavePreview();
  } else {
    wavePreview.hidden = true;
  }
}

function updateWavePreview() {
  const waveSelected = form.querySelector('input[name="pagnePaiement"][value="wave"]')?.checked;
  const qty = parseInt(pagneQuantite.value, 10) || 0;
  const total = qty * siteConfig.pagnePrice;
  const hasPay = siteConfig.wavePaymentLink || siteConfig.wavePhone;
  wavePreview.hidden = !waveSelected || qty === 0 || !hasPay;

  const linkHint = document.getElementById('wave-link-hint');
  if (linkHint) {
    linkHint.hidden = !siteConfig.wavePaymentLink || !waveSelected || qty === 0;
    if (!linkHint.hidden) {
      linkHint.textContent = `Page Wave avec montant : ${total.toLocaleString('fr-FR')} FCFA`;
    }
  }
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
document.querySelectorAll('input[name="pagnePaiement"]').forEach((radio) => {
  radio.addEventListener('change', updateWavePreview);
});

function buildWaveUrl(amount) {
  if (siteConfig.wavePaymentLink) {
    const base = siteConfig.wavePaymentLink.trim().replace(/\?amount=\d*$/, '');
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}amount=${amount}`;
  }
  return null;
}

function openWavePayment(amount) {
  const url = buildWaveUrl(amount);
  if (url) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (siteConfig.wavePhone) {
    alert(
      `Effectuez un dépôt Wave ou Orange Money au ${siteConfig.wavePhone}\n` +
        `Montant : ${amount.toLocaleString('fr-FR')} FCFA\n\n` +
        'Indiquez votre nom en référence du paiement.'
    );
    return;
  }
  alert('Paiement non configuré. Contactez les mariés.');
}

async function copyWavePhone(btn) {
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

document.getElementById('btn-copy-wave')?.addEventListener('click', (e) => {
  copyWavePhone(e.currentTarget);
});

document.getElementById('btn-copy-wave-success')?.addEventListener('click', (e) => {
  copyWavePhone(e.currentTarget);
});

function initScrollHint() {
  const hint = document.getElementById('scroll-hint');
  const rsvp = document.getElementById('rsvp');
  if (!hint || !rsvp) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      hint.classList.toggle('hidden', entry.isIntersecting);
    },
    { threshold: 0.15 }
  );
  observer.observe(rsvp);

  hint.addEventListener('click', () => {
    hint.classList.add('hidden');
  });
}

function showSuccessWave(pagne) {
  if (!pagne || pagne.paiement !== 'wave') {
    successWave.hidden = true;
    return;
  }

  successWave.hidden = false;
  document.getElementById('success-wave-amount').textContent =
    `${pagne.quantite} pagne(s) — ${pagne.total.toLocaleString('fr-FR')} FCFA à régler`;
  document.getElementById('success-wave-phone').textContent = siteConfig.wavePhone || '';

  const btn = document.getElementById('btn-open-wave');
  if (siteConfig.wavePaymentLink) {
    btn.textContent = 'Ouvrir la page Wave pour payer';
    btn.onclick = () => openWavePayment(pagne.total);
  } else {
    btn.textContent = 'Voir les instructions de paiement';
    btn.onclick = () => openWavePayment(pagne.total);
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.hidden = true;

  const qty = parseInt(pagneQuantite.value, 10) || 0;
  const pagnePaiementEl = form.querySelector('input[name="pagnePaiement"]:checked');

  const data = {
    prenom: form.prenom.value,
    nom: form.nom.value,
    telephone: form.telephone.value,
    presence: form.presence.value,
    nombreAdultes: form.nombreAdultes?.value ?? '0',
    nombreEnfants: form.nombreEnfants?.value || '0',
    message: form.message.value,
    pagneQuantite: qty,
    pagnePaiement: qty > 0 ? pagnePaiementEl?.value || 'plus_tard' : 'aucun',
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
      form.hidden = true;
      document.querySelector('.rsvp-header').hidden = true;
      document.getElementById('success-icon').textContent = '✓';
      document.getElementById('success-title').textContent = 'Déjà inscrit(e)';
      document.getElementById('success-message').textContent = result.error;
      successWave.hidden = true;
      successEl.classList.add('success--duplicate');
      successEl.hidden = false;
      return;
    }

    if (!res.ok) {
      throw new Error(result.error || 'Une erreur est survenue.');
    }

    form.hidden = true;
    document.querySelector('.rsvp-header').hidden = true;
    document.getElementById('success-icon').textContent = '💍';
    document.getElementById('success-title').textContent = 'Merci du fond du cœur';
    document.getElementById('success-message').textContent = result.message;
    showSuccessWave(result.pagne);
    successEl.classList.remove('success--duplicate');
    successEl.hidden = false;
  } catch (err) {
    const isNetworkError = err.message === 'Failed to fetch' || err.name === 'TypeError';
    formError.textContent = isNetworkError
      ? 'Impossible de contacter le serveur. Ouvrez la page via http://localhost:3000 (pas en fichier local) et vérifiez que le serveur est démarré (npm start).'
      : err.message;
    formError.hidden = false;
    submitBtn.disabled = false;
    submitBtn.querySelector('.btn-text').textContent = 'Envoyer ma réponse';
  }
});
