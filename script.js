// CACHE GLOBALE - Aggiungi all'inizio del file
let cachedValues = null;
let cacheInvalidated = true;

// === CURSORE CUSTOM (funziona su tutte le pagine) === 
const cursor = document.querySelector('.cursor');

if (cursor) {
  document.addEventListener('mousemove', (e) => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';
  });
}


function getResponsiveValues() {
  // Ricalcola solo se necessario
  if (!cacheInvalidated && cachedValues) {
    return cachedValues;
  }

  const vw = window.innerWidth / 100;
  const vh = window.innerHeight / 100;
  const root = getComputedStyle(document.documentElement);

  cachedValues = {
    radiusX: parseFloat(root.getPropertyValue('--ellipse-radius-x')) * vw,
    radiusY: parseFloat(root.getPropertyValue('--ellipse-radius-y')) * vh,
    rotationDuration: parseInt(root.getPropertyValue('--rotation-duration')),
    rotationDirection: parseInt(root.getPropertyValue('--rotation-direction')),
    ellipseRotation: parseFloat(root.getPropertyValue('--ellipse-rotation'))
  };

  cacheInvalidated = false;
  return cachedValues;
}

// Invalida cache al resize
window.addEventListener('resize', () => {
  cacheInvalidated = true;
});


// ============================================
// === CONFIGURAZIONE CAROSELLO ===
// ============================================

const carouselConfig = {
  numberOfCards: 8,
  cards: [
    {
      image: 'resources/manuale2.gif',
      aspectRatio: 'auto',
      link: '#card1',
      caption: 'Hand typography'
    },
    {
      image: 'resources/tictac.jpg',
      aspectRatio: 'auto',
      link: '#card2',
      caption: 'Brochure for Tic Tac'
    },
    {
      image: 'resources/loghi.gif',
      aspectRatio: 'auto',
      link: '#card3',
      caption: 'Selection of logos'
    },
    {
      image: 'resources/gatto funivia ig v2.jpg',
      aspectRatio: 'auto',
      link: '#card4',
      caption: 'Illustration for social media'
    },
    {
      image: 'resources/qreativa.gif',
      aspectRatio: 'auto',
      link: '#card5',
      caption: 'Illustrations for a blog'
    },
    {
      image: 'resources/shaun 9 edit.jpg',
      aspectRatio: 'auto',
      link: '#card6',
      caption: '3D Character design - Shaun'
    },
    {
      image: 'resources/ng.gif',
      aspectRatio: 'auto',
      link: '#card7',
      caption: 'Logo animation'
    },
    {
      image: 'resources/render 5 insta 9 16.jpg',
      aspectRatio: 'auto',
      link: '#card8',
      caption: '3D Rendering'
    }
  ],
  startAngleOffset: -90
};



// ============================================
// === VARIABILI GLOBALI ===
// ============================================

let cardElements = [];
let animationStartTime = null;
let containerWidth, containerHeight;
let currentModalCard = null;
let isModalActive = false;

// === VARIABILI PER DEFORMAZIONE ELLISSE ===
let mouseInfluence = { x: 0, y: 0 };
let targetMouseInfluence = { x: 0, y: 0 };
const ELLIPSE_DEFORM_AMOUNT = 0.15; // 15% di deformazione massima
const MOUSE_SMOOTHING = 0.08; // Easing per movimento fluido


// ============================================
// === FUNZIONI CAROSELLO ===
// ============================================
// AGGIUNGI CACHE GLOBALE
let cachedResponsiveValues = null;
let lastWindowWidth = 0;
let lastWindowHeight = 0;

function getResponsiveValues() {
  // Ricalcola solo se le dimensioni sono cambiate
  if (cachedResponsiveValues &&
    lastWindowWidth === window.innerWidth &&
    lastWindowHeight === window.innerHeight) {
    return cachedResponsiveValues;
  }

  const vw = window.innerWidth / 100;
  const vh = window.innerHeight / 100;
  const root = getComputedStyle(document.documentElement);

  cachedResponsiveValues = {
    radiusX: parseFloat(root.getPropertyValue('--ellipse-radius-x')) * vw,
    radiusY: parseFloat(root.getPropertyValue('--ellipse-radius-y')) * vh,
    rotationDuration: parseInt(root.getPropertyValue('--rotation-duration')),
    rotationDirection: parseInt(root.getPropertyValue('--rotation-direction')),
    ellipseRotation: parseFloat(root.getPropertyValue('--ellipse-rotation'))
  };

  lastWindowWidth = window.innerWidth;
  lastWindowHeight = window.innerHeight;

  return cachedResponsiveValues;
}

// Invalida la cache al resize
window.addEventListener('resize', () => {
  cachedResponsiveValues = null;
  const container = document.querySelector('.carousel-container');
  containerWidth = container.offsetWidth;
  containerHeight = container.offsetHeight;
});

// === CALCOLA DEFORMAZIONE ELLISSE BASATA SU MOUSE ===
function updateMouseInfluence() {
  // Easing smooth verso il target
  mouseInfluence.x += (targetMouseInfluence.x - mouseInfluence.x) * MOUSE_SMOOTHING;
  mouseInfluence.y += (targetMouseInfluence.y - mouseInfluence.y) * MOUSE_SMOOTHING;
}

// === LISTENER MOVIMENTO MOUSE ===
function initMouseEllipseDeformation() {
  document.addEventListener('mousemove', (e) => {
    // Normalizza coordinate mouse da -1 a 1 (centro = 0)
    const normalizedX = (e.clientX / window.innerWidth) * 2 - 1;
    const normalizedY = (e.clientY / window.innerHeight) * 2 - 1;

    targetMouseInfluence.x = normalizedX;
    targetMouseInfluence.y = normalizedY;
  });
}

function rotatePoint(x, y, angleDegrees) {
  const angleRad = (angleDegrees * Math.PI) / 180;
  const xRotated = x * Math.cos(angleRad) - y * Math.sin(angleRad);
  const yRotated = x * Math.sin(angleRad) + y * Math.cos(angleRad);
  return { x: xRotated, y: yRotated };
}

// ============================================
// === FUNZIONI MODAL ===
// ============================================

function getImageNaturalDimensions(imageUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      resolve({ width: 1, height: 1 }); // Fallback 1:1
    };
    img.src = imageUrl;
  });
}

function calculateModalDimensions(aspectRatio, cardData) {
  const maxWidth = parseInt(getComputedStyle(document.documentElement)
    .getPropertyValue('--modal-card-max-width'));
  const maxHeight = parseInt(getComputedStyle(document.documentElement)
    .getPropertyValue('--modal-card-max-height'));

  const vw = window.innerWidth / 100;
  const vh = window.innerHeight / 100;
  const maxWidthPx = maxWidth * vw;
  const maxHeightPx = maxHeight * vh;

  let width, height;

  if (aspectRatio === 'auto' || !aspectRatio) {
    // Usa dimensioni naturali dell'immagine (calcolate dinamicamente)
    return 'auto'; // Gestito dinamicamente
  } else if (aspectRatio.includes(':')) {
    // Formato "16:9", "4:3", ecc.
    const [w, h] = aspectRatio.split(':').map(Number);
    const ratio = w / h;

    // Calcola dimensioni mantenendo aspect ratio e limiti
    if (maxWidthPx / ratio <= maxHeightPx) {
      width = maxWidthPx;
      height = maxWidthPx / ratio;
    } else {
      height = maxHeightPx;
      width = maxHeightPx * ratio;
    }
  } else {
    // Fallback quadrato
    const size = Math.min(maxWidthPx, maxHeightPx);
    width = height = size;
  }

  return { width: Math.round(width), height: Math.round(height) };
}

async function openModal(cardElement, cardIndex, cardData) {
  if (isModalActive) return;
  isModalActive = true;
  currentModalCard = cardElement;

  // ⭐ SALVA LA POSIZIONE CORRENTE PRIMA DI SPOSTARE
  const rect = cardElement.getBoundingClientRect();
  cardElement.dataset.originalLeft = rect.left + 'px';
  cardElement.dataset.originalTop = rect.top + 'px';
  cardElement.dataset.originalWidth = rect.width + 'px';
  cardElement.dataset.originalHeight = rect.height + 'px';

  // Attiva overlay e blur
  const overlay = document.getElementById('modalOverlay');
  const container = document.getElementById('carouselContainer');
  overlay.classList.add('active');
  container.classList.add('blurred');

  // ⭐ POSIZIONA LA CARD NELLA POSIZIONE CORRENTE (non centrata)
  cardElement.style.position = 'fixed';
  cardElement.style.left = cardElement.dataset.originalLeft;
  cardElement.style.top = cardElement.dataset.originalTop;
  cardElement.style.width = cardElement.dataset.originalWidth;
  cardElement.style.height = cardElement.dataset.originalHeight;
  cardElement.style.transform = 'translate(-50%, -50%)';

  // Sposta nel body
  document.body.appendChild(cardElement);

  // ⭐ ATTENDI UN FRAME per permettere al browser di applicare gli stili
  await new Promise(resolve => requestAnimationFrame(resolve));

  // Aggiungi classe modal per attivare la transizione
  cardElement.classList.add('modal-active');

  // Calcola dimensioni modal
  if (cardData.aspectRatio === 'auto') {
    try {
      const naturalDims = await getImageNaturalDimensions(cardData.image);
      const aspectRatio = naturalDims.width / naturalDims.height;
      const maxWidth = window.innerWidth * 0.8;
      const maxHeight = window.innerHeight * 0.8;

      let width, height;
      if (maxWidth / aspectRatio <= maxHeight) {
        width = maxWidth;
        height = maxWidth / aspectRatio;
      } else {
        height = maxHeight;
        width = maxHeight * aspectRatio;
      }

      cardElement.style.width = Math.round(width) + 'px';
      cardElement.style.height = Math.round(height) + 'px';
    } catch (error) {
      console.warn('Errore nel caricare dimensioni immagine:', error);
      cardElement.style.width = '400px';
      cardElement.style.height = '400px';
    }
  } else {
    const dimensions = calculateModalDimensions(cardData.aspectRatio, cardData);
    if (dimensions !== 'auto') {
      cardElement.style.width = dimensions.width + 'px';
      cardElement.style.height = dimensions.height + 'px';
    }
  }

  // ⭐ ANIMA VERSO IL CENTRO
  cardElement.style.left = '50%';
  cardElement.style.top = '50%';
}

function closeModal() {
  if (!isModalActive || !currentModalCard) return;

  // ⭐ RIMUOVI SUBITO LA CLASSE MODAL per permettere agli stili inline di funzionare
  currentModalCard.classList.remove('modal-active');

  // ⭐ TROVA I DATI DELLA CARD NEL CAROSELLO
  const cardData = cardElements.find(c => c.element === currentModalCard);
  if (!cardData) return;

  // ⭐ CALCOLA LA POSIZIONE CORRENTE NEL CAROSELLO
  const { radiusX, radiusY, rotationDuration, rotationDirection, ellipseRotation } = getResponsiveValues();

  const elapsed = performance.now() - animationStartTime;
  const progress = (elapsed / rotationDuration) % 1;
  const currentRotation = progress * 360 * rotationDirection;

  const angle = cardData.initialAngle + currentRotation;
  const angleRad = (angle * Math.PI) / 180;

  const xEllipse = Math.cos(angleRad) * radiusX;
  const yEllipse = Math.sin(angleRad) * radiusY;
  const rotated = rotatePoint(xEllipse, yEllipse, ellipseRotation);

  // ⭐ OTTIENI IL CENTRO DEL CONTAINER NEL VIEWPORT
  const container = document.getElementById('carouselContainer');
  const containerRect = container.getBoundingClientRect();
  const absoluteCenterX = containerRect.left + containerRect.width / 2;
  const absoluteCenterY = containerRect.top + containerRect.height / 2;

  // ⭐ CALCOLA POSIZIONE ASSOLUTA NEL VIEWPORT
  const targetX = absoluteCenterX + rotated.x;
  const targetY = absoluteCenterY + rotated.y;

  // ⭐ OTTIENI LA DIMENSIONE DELLA CARD NEL CAROSELLO
  const cardSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-size'));
  const actualSize = (cardSize / 100) * Math.min(window.innerWidth, window.innerHeight);

  // ⭐ ORA GLI STILI INLINE FUNZIONANO (niente più !important che li blocca)
  currentModalCard.style.position = 'fixed';
  currentModalCard.style.left = `${targetX}px`;
  currentModalCard.style.top = `${targetY}px`;
  currentModalCard.style.width = `${actualSize}px`;
  currentModalCard.style.height = `${actualSize}px`;
  currentModalCard.style.transform = 'translate(-50%, -50%)';
  currentModalCard.style.zIndex = '21000';

  // ⭐ ATTENDI LA FINE DELLA TRANSIZIONE
  setTimeout(() => {
    isModalActive = false;

    // Rimuovi overlay e blur
    const overlay = document.getElementById('modalOverlay');
    const container = document.getElementById('carouselContainer');
    overlay.classList.remove('active');
    container.classList.remove('blurred');

    // Rimetti la card nel carosello
    const carousel = document.getElementById('carousel');
    carousel.appendChild(currentModalCard);

    // Reset inline styles
    currentModalCard.style.position = '';
    currentModalCard.style.left = '';
    currentModalCard.style.top = '';
    currentModalCard.style.width = '';
    currentModalCard.style.height = '';
    currentModalCard.style.transform = '';
    currentModalCard.style.zIndex = '';

    currentModalCard = null;
  }, 400);
}



// ============================================
// === FUNZIONI PRINCIPALI ===
// ============================================

function createCarousel() {
  const carousel = document.getElementById('carousel');
  const container = document.querySelector('.carousel-container');
  containerWidth = container.offsetWidth;
  containerHeight = container.offsetHeight;

  // Crea ogni card
  for (let i = 0; i < carouselConfig.numberOfCards; i++) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.index = i;

    // Configura l'immagine di sfondo
    if (carouselConfig.cards[i]) {
      const cardData = carouselConfig.cards[i];
      card.style.backgroundImage = `url('${cardData.image}')`;

      // ⭐ AGGIUNGI LA DIDASCALIA
      if (cardData.caption) {
        const caption = document.createElement('div');
        caption.className = 'card-caption';
        caption.textContent = cardData.caption;
        card.appendChild(caption);
      }

      // Aggiungi evento click per modal
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!isModalActive) {
          openModal(card, i, cardData);
        }
      });
    }

    carousel.appendChild(card);
    cardElements.push({
      element: card,
      index: i,
      initialAngle: (i * 360 / carouselConfig.numberOfCards) + carouselConfig.startAngleOffset
    });
  }

  // Avvia l'animazione
  animationStartTime = performance.now();
  // ⭐ INIZIALIZZA DEFORMAZIONE ELLISSE CON MOUSE
  initMouseEllipseDeformation();
  animate();

  // Event listener per chiudere modal
  setupModalEvents();
}


function setupModalEvents() {
  const overlay = document.getElementById('modalOverlay');

  // Click su overlay per chiudere
  overlay.addEventListener('click', closeModal);

  // Escape key per chiudere
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isModalActive) {
      closeModal();
    }
  });

  // Click su body per chiudere (tranne su card)
  document.addEventListener('click', (e) => {
    if (isModalActive && !e.target.closest('.card')) {
      closeModal();
    }
  });
}

function animate(currentTime) {
  if (!animationStartTime) animationStartTime = currentTime;

  const { radiusX, radiusY, rotationDuration, rotationDirection, ellipseRotation } = getResponsiveValues();

  // Aggiorna mouse influence
  mouseInfluence.x += (targetMouseInfluence.x - mouseInfluence.x) * MOUSE_SMOOTHING;
  mouseInfluence.y += (targetMouseInfluence.y - mouseInfluence.y) * MOUSE_SMOOTHING;

  // Precalcola valori comuni
  const offsetX = mouseInfluence.x * radiusX * ELLIPSE_DEFORM_AMOUNT;
  const offsetY = mouseInfluence.y * radiusY * ELLIPSE_DEFORM_AMOUNT;
  const deformedRadiusX = radiusX * (1 + mouseInfluence.x * 0.1);
  const deformedRadiusY = radiusY * (1 + mouseInfluence.y * 0.1);

  const elapsed = currentTime - animationStartTime;
  const progress = (elapsed / rotationDuration) % 1;
  const currentRotation = progress * 360 * rotationDirection;

  const centerX = (containerWidth / 2) + offsetX;
  const centerY = (containerHeight / 2) + offsetY;

  // Usa for loop invece di forEach per performance
  for (let i = 0; i < cardElements.length; i++) {
    const cardData = cardElements[i];

    if (cardData.element.classList.contains('modal-active')) continue;

    const angle = cardData.initialAngle + currentRotation;
    const angleRad = angle * 0.017453292519943295; // Math.PI / 180 precalcolato

    const xEllipse = Math.cos(angleRad) * deformedRadiusX;
    const yEllipse = Math.sin(angleRad) * deformedRadiusY;

    // Cache la rotazione
    const rotated = rotatePoint(xEllipse, yEllipse, ellipseRotation);

    // Batch DOM updates
    const element = cardData.element;
    const style = element.style;
    style.left = (centerX + rotated.x) + 'px';
    style.top = (centerY + rotated.y) + 'px';

    const zIndex = 1000 + Math.round((rotated.y / deformedRadiusY) * 500 + (rotated.x / deformedRadiusX) * 50);
    style.zIndex = zIndex;
  }

  requestAnimationFrame(animate);
}



// Aggiorna dimensioni container su resize
window.addEventListener('resize', () => {
  const container = document.querySelector('.carousel-container');
  containerWidth = container.offsetWidth;
  containerHeight = container.offsetHeight;
});

window.addEventListener('load', () => {
  setTimeout(() => {
    createCarousel();
    const el = document.querySelector('.bottom-text');
    if (el) {
      el.style.display = 'none';
      el.style.display = '';
    }
  }, 30);
});
// ============================================
// === MOTION PAGE LIGHTBOX LOGIC (DOM MOVE) ===
// ============================================

function initMotionLightbox() {
  const motionContainer = document.querySelector('.motion-container');
  if (!motionContainer) return;

  const wrappers = document.querySelectorAll('.video-wrapper');
  // Assicuriamoci che l'overlay esista
  let overlay = document.getElementById('modalOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modalOverlay';
    document.body.appendChild(overlay);
  }

  wrappers.forEach(wrapper => {
    // Salva il genitore originale per sapere dove tornare
    wrapper._originalParent = wrapper.parentNode;
    wrapper._originalNextSibling = wrapper.nextSibling;

    wrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      if (wrapper.classList.contains('lightbox-active')) {
        closeMotionLightbox(wrapper);
      } else {
        openMotionLightbox(wrapper);
      }
    });
  });

  overlay.addEventListener('click', () => {
    const activeWrapper = document.querySelector('.video-wrapper.lightbox-active');
    if (activeWrapper) closeMotionLightbox(activeWrapper);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const activeWrapper = document.querySelector('.video-wrapper.lightbox-active');
      if (activeWrapper) closeMotionLightbox(activeWrapper);
    }
  });
}

function openMotionLightbox(wrapper) {
  const video = wrapper.querySelector('video');
  const overlay = document.getElementById('modalOverlay');

  // 1. Misura posizione iniziale
  const rect = wrapper.getBoundingClientRect();

  // 2. Crea il PLACEHOLDER (il buco nella griglia)
  const placeholder = document.createElement('div');
  placeholder.className = 'video-wrapper grid-placeholder';
  placeholder.style.width = rect.width + 'px';
  placeholder.style.height = rect.height + 'px';

  // Inserisci placeholder al posto del video
  wrapper._originalParent.insertBefore(placeholder, wrapper);
  wrapper._placeholder = placeholder;

  // 3. TELETRASPORTO: Sposta il wrapper nel BODY (fuori dalla griglia)
  // Questo risolve il problema dello z-index sfocato
  document.body.appendChild(wrapper);

  // 4. Posiziona il wrapper esattamente dove era (sopra il placeholder)
  wrapper.style.position = 'fixed';
  wrapper.style.top = rect.top + 'px';
  wrapper.style.left = rect.left + 'px';
  wrapper.style.width = rect.width + 'px';
  wrapper.style.height = rect.height + 'px';
  wrapper.style.zIndex = '21005';
  wrapper.style.margin = '0';

  // Forza reflow
  void wrapper.offsetWidth;

  // 5. Attiva l'animazione verso il centro
  requestAnimationFrame(() => {
    wrapper.classList.add('lightbox-active');
    // Rimuovi stili inline per lasciare che il CSS gestisca la posizione centrale
    wrapper.style.top = '';
    wrapper.style.left = '';
    wrapper.style.width = '';
    wrapper.style.height = '';
  });

  // 6. Attiva Overlay e Video
  overlay.classList.add('active');
  video.muted = false;
  video.currentTime = 0;
  video.play();
}

function closeMotionLightbox(wrapper) {
  const overlay = document.getElementById('modalOverlay');
  const video = wrapper.querySelector('video');
  const placeholder = wrapper._placeholder;

  // 1. Muta video
  video.muted = true;

  // 2. Rimuovi classe attiva
  wrapper.classList.remove('lightbox-active');

  // 3. Anima indietro verso il placeholder
  if (placeholder) {
    const rect = placeholder.getBoundingClientRect();
    wrapper.style.position = 'fixed';
    wrapper.style.top = rect.top + 'px';
    wrapper.style.left = rect.left + 'px';
    wrapper.style.width = rect.width + 'px';
    wrapper.style.height = rect.height + 'px';
  }

  // 4. Nascondi overlay
  overlay.classList.remove('active');

  // 5. Alla fine dell'animazione (0.4s), rimetti tutto a posto
  setTimeout(() => {
    // Ritorno a casa (nella griglia)
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(wrapper, placeholder);
      placeholder.parentNode.removeChild(placeholder);
    } else {
      // Fallback se il placeholder è sparito
      wrapper._originalParent.appendChild(wrapper);
    }

    // Pulizia stili
    wrapper.style = '';
    delete wrapper._placeholder;
  }, 400);
}


// Avvia la logica al caricamento
window.addEventListener('DOMContentLoaded', initMotionLightbox);
// Backup per caricamenti asincroni o cambi pagina
window.addEventListener('load', initMotionLightbox);

// ============================================
// === SMART VIDEO LOADER (Performance Fix) ===
// ============================================
document.addEventListener("DOMContentLoaded", function() {
  // Seleziona solo i video con la nostra classe speciale
  var lazyVideos = [].slice.call(document.querySelectorAll("video.lazy-video"));

  if ("IntersectionObserver" in window) {
    var lazyVideoObserver = new IntersectionObserver(function(entries, observer) {
      entries.forEach(function(video) {
        if (video.isIntersecting) {
          // Se il video entra nello schermo: carica e play
          // Iteriamo sui figli <source> se necessario, o direttamente sul video
          video.target.preload = "metadata"; 
          video.target.play();
        } else {
          // Se esce: pausa per risparmiare risorse
          video.target.pause();
        }
      });
    });

    lazyVideos.forEach(function(lazyVideo) {
      lazyVideoObserver.observe(lazyVideo);
    });
  } else {
    // Fallback per browser preistorici: falli partire tutti subito
    lazyVideos.forEach(function(video) {
        video.play();
    });
  }
});
