const intro = document.getElementById('intro');
const page = document.getElementById('page');
const openBtn = document.getElementById('open-invite');
const form = document.getElementById('rsvp-form');
const successEl = document.getElementById('success');
const formError = document.getElementById('form-error');
const submitBtn = document.getElementById('submit-btn');
const guestsField = document.getElementById('guests-field');

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

document.querySelectorAll('input[name="presence"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    guestsField.hidden = radio.value !== 'oui' || !radio.checked;
  });
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

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.hidden = true;

  const data = {
    prenom: form.prenom.value,
    nom: form.nom.value,
    telephone: form.telephone.value,
    presence: form.presence.value,
    nombreAdultes: form.nombreAdultes?.value ?? '0',
    nombreEnfants: form.nombreEnfants?.value || '0',
    message: form.message.value,
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
