// CACHE GLOBALE - Performance: caching
let cachedValues = null;
let cacheInvalidated = true;
// Performance: pre-calcolo costanti
const DEG_TO_RAD = Math.PI / 180;

// === CURSORE CUSTOM (funziona su tutte le pagine) === 
const customCursorElement = document.querySelector('.custom-cursor') || document.querySelector('.cursor');

if (customCursorElement) {
  document.addEventListener('mousemove', (e) => {
    // PERFORMANCE: Use transform instead of left/top
    customCursorElement.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
  });
}

function getResponsiveValues() {
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

window.addEventListener('resize', () => {
  cacheInvalidated = true;
  cachedResponsiveValues = null;
  const container = document.querySelector('.carousel-container');
  if(container) {
    containerWidth = container.offsetWidth;
    containerHeight = container.offsetHeight;
  }
});


// ============================================
// === CONFIGURAZIONE CAROSELLO ===
// ============================================

const carouselConfig = {
  numberOfCards: 8,
  cards: [
    { image: 'resources/manuale2.gif', aspectRatio: 'auto', link: '#card1', caption: 'Hand typography' },
    { image: 'resources/tictac.jpg', aspectRatio: 'auto', link: '#card2', caption: 'Brochure for Tic Tac' },
    { image: 'resources/loghi.gif', aspectRatio: 'auto', link: '#card3', caption: 'Selection of logos' },
    { image: 'resources/gatto funivia ig v2.jpg', aspectRatio: 'auto', link: '#card4', caption: 'Illustration for social media' },
    { image: 'resources/qreativa.gif', aspectRatio: 'auto', link: '#card5', caption: 'Illustrations for a blog' },
    { image: 'resources/shaun 9 edit.jpg', aspectRatio: 'auto', link: '#card6', caption: '3D Character design - Shaun' },
    { image: 'resources/ng.gif', aspectRatio: 'auto', link: '#card7', caption: 'Logo animation' },
    { image: 'resources/render 5 insta 9 16.jpg', aspectRatio: 'auto', link: '#card8', caption: '3D Rendering' }
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
const ELLIPSE_DEFORM_AMOUNT = 0.15;
const MOUSE_SMOOTHING = 0.08;

// AGGIUNGI CACHE GLOBALE CAROUSEL
let cachedResponsiveValues = null;
let lastWindowWidth = 0;
let lastWindowHeight = 0;

function updateMouseInfluence() {
  mouseInfluence.x += (targetMouseInfluence.x - mouseInfluence.x) * MOUSE_SMOOTHING;
  mouseInfluence.y += (targetMouseInfluence.y - mouseInfluence.y) * MOUSE_SMOOTHING;
}

function initMouseEllipseDeformation() {
  document.addEventListener('mousemove', (e) => {
    // Normalizza da -1 a 1
    const normalizedX = (e.clientX / window.innerWidth) * 2 - 1;
    const normalizedY = (e.clientY / window.innerHeight) * 2 - 1;

    targetMouseInfluence.x = normalizedX;
    targetMouseInfluence.y = normalizedY;
  });
}

function rotatePoint(x, y, angleDegrees) {
  const angleRad = angleDegrees * DEG_TO_RAD;
  const sin = Math.sin(angleRad);
  const cos = Math.cos(angleRad);
  return { 
    x: x * cos - y * sin, 
    y: x * sin + y * cos 
  };
}

// ============================================
// === FUNZIONI MODAL ===
// ============================================

function getImageNaturalDimensions(imageUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 1, height: 1 });
    img.src = imageUrl;
  });
}

function calculateModalDimensions(aspectRatio, cardData) {
  const maxWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--modal-card-max-width'));
  const maxHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--modal-card-max-height'));
  const vw = window.innerWidth / 100;
  const vh = window.innerHeight / 100;
  const maxWidthPx = maxWidth * vw;
  const maxHeightPx = maxHeight * vh;

  let width, height;

  if (aspectRatio === 'auto' || !aspectRatio) {
    return 'auto';
  } else if (aspectRatio.includes(':')) {
    const [w, h] = aspectRatio.split(':').map(Number);
    const ratio = w / h;
    if (maxWidthPx / ratio <= maxHeightPx) {
      width = maxWidthPx;
      height = maxWidthPx / ratio;
    } else {
      height = maxHeightPx;
      width = maxHeightPx * ratio;
    }
  } else {
    const size = Math.min(maxWidthPx, maxHeightPx);
    width = height = size;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

async function openModal(cardElement, cardIndex, cardData) {
  if (isModalActive) return;
  isModalActive = true;
  currentModalCard = cardElement;

  // 1. Cattura stato corrente
  const rect = cardElement.getBoundingClientRect();
  cardElement.dataset.originalWidth = rect.width + 'px';
  cardElement.dataset.originalHeight = rect.height + 'px';
  
  // Salva l'attuale transform per riferimento se servisse, ma lavoreremo con rect
  const originalTransform = cardElement.style.transform; 
  cardElement.dataset.originalTransform = originalTransform;

  const overlay = document.getElementById('modalOverlay');
  overlay.classList.add('active');

  // 2. Prepara la card per la transizione
  // La muoviamo nel DOM al body per evitare problemi di z-index o overflow
  // Ma invece di usare top/left, usiamo transform per posizionarla esattamente dov'era
  // Rispetto all'angolo in alto a sinistra (0,0)
  
  cardElement.style.position = 'fixed';
  cardElement.style.top = '0px';
  cardElement.style.left = '0px';
  // Impostiamo il transform iniziale per coincidere con la posizione visiva attuale
  // Aggiungiamo translate(0,0) esplicitamente per sovrascrivere il translate(-50%, -50%) del loop se necessario
  // Ma dato che abbiamo settato top:0 left:0, dobbiamo calcolare il translate assoluto
  cardElement.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
  
  cardElement.style.width = rect.width + 'px';
  cardElement.style.height = rect.height + 'px';
  cardElement.style.zIndex = '21000';

  document.body.appendChild(cardElement);

  // Forza reflow
  void cardElement.offsetWidth;

  // 3. Calcola dimensioni target e posizione centrale
  let targetW, targetH;
  
  // (Logica calcolo dimensioni uguale a prima)
  if (cardData.aspectRatio === 'auto') {
    try {
      const naturalDims = await getImageNaturalDimensions(cardData.image);
      const aspectRatio = naturalDims.width / naturalDims.height;
      const maxWidth = window.innerWidth * 0.8;
      const maxHeight = window.innerHeight * 0.8;
      if (maxWidth / aspectRatio <= maxHeight) {
        targetW = maxWidth;
        targetH = maxWidth / aspectRatio;
      } else {
        targetH = maxHeight;
        targetW = maxHeight * aspectRatio;
      }
    } catch (error) {
      targetW = 400; targetH = 400;
    }
  } else {
    const dimensions = calculateModalDimensions(cardData.aspectRatio, cardData);
    if (dimensions !== 'auto') {
      targetW = dimensions.width;
      targetH = dimensions.height;
    } else {
      targetW = rect.width; targetH = rect.height; // Fallback
    }
  }

  // 4. Anima verso il centro
  // Centro dello schermo
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  // Per centrare un elemento posizionato a 0,0 con transform, trasliamo a centro - metà larghezza
  const targetX = centerX - (targetW / 2);
  const targetY = centerY - (targetH / 2);

  requestAnimationFrame(() => {
    cardElement.classList.add('modal-active'); // Gestisce ombre e transizioni
    cardElement.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
    cardElement.style.width = targetW + 'px';
    cardElement.style.height = targetH + 'px';
  });
}

function closeModal() {
  if (!isModalActive || !currentModalCard) return;

  currentModalCard.classList.remove('modal-active');

  const cardData = cardElements.find(c => c.element === currentModalCard);
  if (!cardData) return;

  // 1. Ricalcola dove dovrebbe essere nel carosello ORA
  const { radiusX, radiusY, rotationDuration, rotationDirection, ellipseRotation } = getResponsiveValues();
  // Usa currentTime corrente approssimato
  const elapsed = performance.now() - animationStartTime;
  const progress = (elapsed / rotationDuration) % 1;
  const currentRotation = progress * 360 * rotationDirection;
  const angle = cardData.initialAngle + currentRotation;
  
  const offsetX = mouseInfluence.x * radiusX * ELLIPSE_DEFORM_AMOUNT;
  const offsetY = mouseInfluence.y * radiusY * ELLIPSE_DEFORM_AMOUNT;
  const deformedRadiusX = radiusX * (1 + mouseInfluence.x * 0.1);
  const deformedRadiusY = radiusY * (1 + mouseInfluence.y * 0.1);

  const angleRad = angle * DEG_TO_RAD;
  const xEllipse = Math.cos(angleRad) * deformedRadiusX;
  const yEllipse = Math.sin(angleRad) * deformedRadiusY;
  const rotated = rotatePoint(xEllipse, yEllipse, ellipseRotation);

  const container = document.getElementById('carouselContainer');
  // Se il container non c'è (es. cambiato pagina), abort
  if(!container) return;

  const containerRect = container.getBoundingClientRect();
  const absoluteCenterX = containerRect.left + containerRect.width / 2;
  const absoluteCenterY = containerRect.top + containerRect.height / 2;

  // Questa è la posizione centrale esatta dove l'elemento dovrebbe stare
  const targetCenterX = absoluteCenterX + rotated.x + offsetX; 
  const targetCenterY = absoluteCenterY + rotated.y + offsetY;

  // Dimensioni originali
  const originalW = parseFloat(currentModalCard.dataset.originalWidth);
  const originalH = parseFloat(currentModalCard.dataset.originalHeight);
  
  // Dato che stiamo usando top:0 left:0 e transform, dobbiamo calcolare
  // il transform che porta l'angolo in alto a sinistra della card alla posizione giusta.
  // Il loop `animate` usa `translate(-50%, -50%)`, quindi il suo punto di ancoraggio è il centro.
  // Noi stiamo animando una card che ha origine in alto a sinistra.
  // Posizione target (angolo in alto a sx) = Centro Target - Metà dimensione
  const targetLeft = targetCenterX - (originalW / 2);
  const targetTop = targetCenterY - (originalH / 2);

  // 2. Applica l'animazione di ritorno usando TRANSFORM
  // Non tocchiamo top/left (rimangono 0).
  currentModalCard.style.transform = `translate3d(${targetLeft}px, ${targetTop}px, 0)`;
  currentModalCard.style.width = currentModalCard.dataset.originalWidth;
  currentModalCard.style.height = currentModalCard.dataset.originalHeight;

  // 3. Cleanup dopo la transizione
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.remove('active');

  setTimeout(() => {
    isModalActive = false;
    
    // Rimetti nel container
    const carousel = document.getElementById('carousel');
    carousel.appendChild(currentModalCard);

    // RESETTA TUTTO per dare controllo al loop
    // È fondamentale rimuovere position fixed e i transform manuali
    // Il loop animate() sovrascriverà il transform al frame successivo
    currentModalCard.style.position = '';
    currentModalCard.style.top = '';
    currentModalCard.style.left = '';
    currentModalCard.style.width = '';
    currentModalCard.style.height = '';
    currentModalCard.style.zIndex = '';
    
    // Trick: forziamo l'aggiornamento immediato del transform secondo la logica del loop
    // per evitare il frame di "buco"
    // Questo è il transform che il loop applicherebbe
    const style = currentModalCard.style;
    const centerX = (containerRect.width / 2) + offsetX; // Relativo al container
    const centerY = (containerRect.height / 2) + offsetY;
    const finalX = centerX + rotated.x;
    const finalY = centerY + rotated.y;
    
    // Applichiamo subito lo stile "carousel" (translate -50%, -50%)
    // Nota: ora top/left sono vuoti, quindi l'elemento è relativo al parent (carousel)
    style.transform = `translate3d(${finalX}px, ${finalY}px, 0) translate(-50%, -50%)`;

    currentModalCard = null;
  }, 400); // Deve coincidere con CSS transition duration
}


// ============================================
// === FUNZIONI PRINCIPALI ===
// ============================================

function createCarousel() {
  const carousel = document.getElementById('carousel');
  const container = document.querySelector('.carousel-container');
  if(container) {
    containerWidth = container.offsetWidth;
    containerHeight = container.offsetHeight;
  }

  for (let i = 0; i < carouselConfig.numberOfCards; i++) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.index = i;

    if (carouselConfig.cards[i]) {
      const cardData = carouselConfig.cards[i];
      card.style.backgroundImage = `url('${cardData.image}')`;
      if (cardData.caption) {
        const caption = document.createElement('div');
        caption.className = 'card-caption';
        caption.textContent = cardData.caption;
        card.appendChild(caption);
      }
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

  animationStartTime = performance.now();
  initMouseEllipseDeformation();
  animate();
  setupModalEvents();
}


function setupModalEvents() {
  const overlay = document.getElementById('modalOverlay');
  if(overlay) overlay.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isModalActive) closeModal();
  });
  document.addEventListener('click', (e) => {
    if (isModalActive && !e.target.closest('.card')) closeModal();
  });
}

function animate(currentTime) {
  requestAnimationFrame(animate); // Keep loop running

  // Se modal attiva, non sprecare calcoli (o continua se vuoi l'effetto sfondo)
  // Qui continuiamo per avere le posizioni pronte al ritorno
  if (!animationStartTime) animationStartTime = currentTime;

  const { radiusX, radiusY, rotationDuration, rotationDirection, ellipseRotation } = getResponsiveValues();

  mouseInfluence.x += (targetMouseInfluence.x - mouseInfluence.x) * MOUSE_SMOOTHING;
  mouseInfluence.y += (targetMouseInfluence.y - mouseInfluence.y) * MOUSE_SMOOTHING;

  const offsetX = mouseInfluence.x * radiusX * ELLIPSE_DEFORM_AMOUNT;
  const offsetY = mouseInfluence.y * radiusY * ELLIPSE_DEFORM_AMOUNT;
  const deformedRadiusX = radiusX * (1 + mouseInfluence.x * 0.1);
  const deformedRadiusY = radiusY * (1 + mouseInfluence.y * 0.1);

  const elapsed = currentTime - animationStartTime;
  const progress = (elapsed / rotationDuration) % 1;
  const currentRotation = progress * 360 * rotationDirection;

  const centerX = (containerWidth / 2) + offsetX;
  const centerY = (containerHeight / 2) + offsetY;

  for (let i = 0; i < cardElements.length; i++) {
    const cardData = cardElements[i];
    if (cardData.element === currentModalCard) continue;

    const angle = cardData.initialAngle + currentRotation;
    const angleRad = angle * DEG_TO_RAD;

    const xEllipse = Math.cos(angleRad) * deformedRadiusX;
    const yEllipse = Math.sin(angleRad) * deformedRadiusY;
    const rotated = rotatePoint(xEllipse, yEllipse, ellipseRotation);

    const style = cardData.element.style;
    
    // === CRITICAL PERFORMANCE FIX ===
    // Use transform3d for GPU acceleration instead of top/left layout trashing
    // Include the centering translation directly here
    const finalX = centerX + rotated.x;
    const finalY = centerY + rotated.y;
    style.transform = `translate3d(${finalX}px, ${finalY}px, 0) translate(-50%, -50%)`;
    
    // Ensure top/left are cleared or 0 if set previously
    // style.left = ''; style.top = ''; (Done via CSS default)

    const zIndex = 1000 + Math.round((rotated.y / deformedRadiusY) * 500 + (rotated.x / deformedRadiusX) * 50);
    style.zIndex = zIndex;
  }
}

// ... MOTION LOGIC REMAINS MOSTLY SAME, ADDED TO END ...

window.addEventListener('load', () => {
  setTimeout(() => {
    // Check if we are on home page
    if (document.getElementById('carousel')) {
        createCarousel();
        const el = document.querySelector('.bottom-text');
        if (el) {
        el.style.display = 'none';
        el.style.display = '';
        }
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
  let overlay = document.getElementById('modalOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modalOverlay';
    document.body.appendChild(overlay);
  }

  wrappers.forEach(wrapper => {
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
  const rect = wrapper.getBoundingClientRect();

  const placeholder = document.createElement('div');
  placeholder.className = 'video-wrapper grid-placeholder';
  placeholder.style.width = rect.width + 'px';
  placeholder.style.height = rect.height + 'px';

  wrapper._originalParent.insertBefore(placeholder, wrapper);
  wrapper._placeholder = placeholder;

  document.body.appendChild(wrapper);

  // START STATE: Fixed at origin (0,0) plus transform to original grid pos
  wrapper.style.position = 'fixed';
  wrapper.style.top = '0';
  wrapper.style.left = '0';
  wrapper.style.margin = '0';
  wrapper.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
  
  wrapper.style.width = rect.width + 'px';
  wrapper.style.height = rect.height + 'px';
  wrapper.style.zIndex = '21005';

  void wrapper.offsetWidth; // Force Reflow

  // CALCOLO DIMENSIONI TARGET E CENTRATURA MANUALE (NO CSS CENTERING)
  // Questo previene il salto di coordinate top/left
  const isMobile = window.innerWidth <= 768;
  const isLandscape = video.videoWidth > video.videoHeight;
  
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let targetW, targetH;

  // Logica dimensionamento simile al CSS ma in JS per calcolare il centro
  if (isMobile) {
      if (isLandscape) {
          // Landscape on mobile: forced rotation
          wrapper.classList.add('rotate-landscape'); // Solo per stile interno (video), ma gestiamo posizionamento qui
          // In CSS .rotate-landscape ha width: 80vh
          targetW = vh * 0.8; 
          // Aspect ratio inverso per il container ruotato non è banale, 
          // ma manteniamo semplice: centriamo il blocco ruotato
          // Nota: la rotazione 90deg in CSS avviene su se stesso.
          // Centriamo il punto perno.
      } else {
          // Portrait mobile
          targetW = vw * 0.95;
          targetH = targetW / (16/9); // Assumo ratio standard o ricalcolo
          if (targetH > vh * 0.85) {
              targetH = vh * 0.85;
              targetW = targetH * (16/9);
          }
      }
  } else {
      // Desktop
      targetW = vw * 0.90;
      targetH = vh * 0.90;
      // Adatta all'aspect ratio reale del video se possibile, qui semplifico max-bounds
      // come fa il CSS object-fit: contain.
      // Per il wrapper però serve una dimensione fisica per il transform.
      // Lasciamo che il CSS gestisca width/height auto/max, 
      // MA per il transform center dobbiamo sapere dove andare.
      
      // FIX SEMPLIFICATO: 
      // Lasciamo che il CSS definisca la dimensione finale (.lightbox-active),
      // MA forziamo noi la posizione top/left a 0 e usiamo transform per centrare.
      // Il problema è che se width è 'auto', non sappiamo il centro esatto.
      
      // APPROCCIO IBRIDO ROBUSTO:
      // Usiamo top: 50%, left: 50% MA SOLO DOPO che l'animazione open è finita? No, glitch.
      // Usiamo il calcolo manuale basato sui limiti max CSS.
  }

  // Se è desktop o mobile portrait semplice:
  if (!isMobile || !isLandscape) {
      // Calcoliamo la dimensione target approssimativa o usiamo valori sicuri
      // Per evitare complessità, usiamo un trucco:
      // Anziché calcolare w/h esatti, usiamo top:0, left:0 e 
      // transform: translate3d(50vw, 50vh, 0) translate(-50%, -50%)
      // Questo usa il % relativo all'elemento stesso per centrarsi!
  }

  requestAnimationFrame(() => {
    wrapper.classList.add('lightbox-active');
    
    // OVERRIDE CSS POSITIONING
    // Il CSS .lightbox-active prova a mettere top: 50%, left: 50%.
    // Noi lo forziamo a rimanere 0,0 via inline styles (hanno priorità)
    wrapper.style.top = '0';
    wrapper.style.left = '0';
    
    // Usiamo il translate per centrare
    if (isMobile && isLandscape) {
        // Centro schermo
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        // Rotazione gestita da CSS transform rotate(90deg)
        // Dobbiamo solo piazzarlo al centro.
        // Attenzione: l'ordine dei transform conta. 
        // Se CSS ha: translate(-50%, -50%) rotate(90deg)
        // Noi dobbiamo replicarlo.
        wrapper.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%) rotate(90deg)`;
    } else {
        // Centro standard
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        wrapper.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;
    }
    
    // Rimuoviamo width/height fissi per lasciare che il CSS (max-width/height) faccia il suo lavoro
    wrapper.style.width = '';
    wrapper.style.height = '';
  });

  overlay.classList.add('active');
  video.muted = false;
  video.currentTime = 0;
  video.play();
}

function closeMotionLightbox(wrapper) {
  const overlay = document.getElementById('modalOverlay');
  const video = wrapper.querySelector('video');
  const placeholder = wrapper._placeholder;

  video.muted = true;
  wrapper.classList.remove('lightbox-active');
  wrapper.classList.remove('rotate-landscape');

  if (placeholder) {
    const rect = placeholder.getBoundingClientRect();
    
    // Manteniamo top/left a 0
    wrapper.style.top = '0';
    wrapper.style.left = '0';
    // Animiamo verso la posizione originale
    wrapper.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
    
    // Forziamo le dimensioni originali per l'animazione di chiusura
    wrapper.style.width = rect.width + 'px';
    wrapper.style.height = rect.height + 'px';
  }

  overlay.classList.remove('active');

  setTimeout(() => {
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(wrapper, placeholder);
      placeholder.parentNode.removeChild(placeholder);
    } else {
      wrapper._originalParent.appendChild(wrapper);
    }
    // Pulizia totale
    wrapper.style.position = '';
    wrapper.style.top = '';
    wrapper.style.left = '';
    wrapper.style.transform = '';
    wrapper.style.width = '';
    wrapper.style.height = '';
    wrapper.style.margin = '';
    wrapper.style.zIndex = '';
    
    delete wrapper._placeholder;
  }, 400);
}

window.addEventListener('DOMContentLoaded', initMotionLightbox);
window.addEventListener('load', initMotionLightbox);

// ============================================
// === SMART VIDEO LOADER (SAFE MOBILE FIX) ===
// ============================================
document.addEventListener("DOMContentLoaded", function () {
    // Selezioniamo tutti i video lazy
    var lazyVideos = [].slice.call(document.querySelectorAll("video.lazy-video"));
  
    if ("IntersectionObserver" in window) {
      var lazyVideoObserver = new IntersectionObserver(function (entries, observer) {
        entries.forEach(function (video) {
          if (video.isIntersecting) {
            // Su mobile è meglio non forzare il preload dinamico se non serve
            // video.target.preload = "metadata"; <-- RIMOSSO per evitare conflitti
            
            // Tenta la riproduzione sicura
            var playPromise = video.target.play();
            
            // Gestione Promise per evitare errori su Safari/Chrome Mobile
            if (playPromise !== undefined) {
              playPromise.catch(error => {
                console.log("Auto-play prevented by browser (Low Power Mode?):", error);
                // Qui potresti mostrare un tasto "Play" se l'autoplay fallisce
              });
            }
          } else {
            video.target.pause();
          }
        });
      }, {
        // Aggiungi un margine per caricare il video PRIMA che entri nello schermo
        rootMargin: "0px 0px 200px 0px" 
      });
  
      lazyVideos.forEach(function (lazyVideo) {
        lazyVideoObserver.observe(lazyVideo);
      });
    } else {
      // Fallback per browser vecchissimi
      lazyVideos.forEach(function (video) {
        video.play();
      });
    }
  });
