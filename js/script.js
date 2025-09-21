document.addEventListener('DOMContentLoaded', function() {
  // Hamburger menu toggle
  const hamburger = document.querySelector('.hamburger-icon');
  const mobileMenu = document.querySelector('.mobile-nav-menu');
  if (hamburger && mobileMenu) {
    hamburger.style.display = '';
    hamburger.addEventListener('click', function() {
      const isOpen = mobileMenu.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    // Optional: close menu when clicking a link (for single-page feel)
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      });

    });

  }

    document.querySelectorAll('.window-close').forEach(button => {
        const header = button.closest('.window-header');
        let next = header.nextElementSibling;
        while (next && !next.classList.contains('window-body')) {
            next = next.nextElementSibling;
        }
        const body = next;
        if (!body) return;

        // Set initial state
        if (button.textContent.trim() === '+') {
            body.style.setProperty('display', 'none', 'important');
        } else {
            body.style.setProperty('display', 'flex', 'important');
        }

        button.addEventListener('click', function(e) {
            e.preventDefault();
            let next = header.nextElementSibling;
            while (next && !next.classList.contains('window-body')) {
                next = next.nextElementSibling;
            }
            const body = next;
            if (!body) return;

            if (body.style.display === 'flex' || body.style.display === '') {
                body.style.setProperty('display', 'none', 'important');
                this.textContent = '+';
            } else {
                body.style.setProperty('display', 'flex', 'important');
                this.textContent = 'X';
            }
        });

    });

});

        // Lista dei percorsi delle tue immagini dei simboli.
        const symbols = [
            "./elementi/symbols/cherry2.png",
            "./elementi/symbols/lemon2.png",
            "./elementi/symbols/orange2.png",
            "./elementi/symbols/grape2.png",
            "./elementi/symbols/diamond2.png",
            "./elementi/symbols/seven2.png" // L'immagine del 7 per il Jackpot
        ];
        const sevenSymbol = "./elementi/symbols/seven2.png";
    
        // Selettori degli elementi HTML
        const reels = [
            document.getElementById("reel1"),
            document.getElementById("reel2"),
            document.getElementById("reel3")
        ];
        const resultDisplay = document.getElementById("result");
        const spinButton = document.getElementById("spinButton");
        const canvas = document.getElementById('particle-canvas');
        const ctx = canvas.getContext('2d');
        
        let particles = [];
        let animationFrameId;
        let isSpinning = false;
        let spinTimeoutIds = [];
    
        function resizeCanvas() {
            const wrapper = document.querySelector('.slot-wrapper');
            canvas.width = wrapper.offsetWidth;
            canvas.height = wrapper.offsetHeight;
            canvas.style.imageRendering = 'pixelated'; // Aggiungere la proprietà image-rendering: pixelated
            canvas.style.filter = 'contrast(1.5) saturate(1.2)'; // Aggiungere filtri per un effetto più pixelato
        }
        window.addEventListener('resize', resizeCanvas);
        
        function particleLoop() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach((p, index) => {
                p.update();
                p.draw();
                if (p.isDead()) {
                    particles.splice(index, 1);
                }
            });
            animationFrameId = (particles.length > 0) ? requestAnimationFrame(particleLoop) : null;
        }
    
        class Particle {
            constructor(x, y) {
                this.x = x; this.y = y;
                this.size = Math.random() * 12 + 8; // Ripristinata dimensione originale
                this.color = `hsl(45, 100%, ${Math.random() * 20 + 65}%)`; // Giallo più scuro e saturo (65-85% luminosità)
                this.vx = (Math.random() - 0.5) * 15;
                this.vy = (Math.random() * -20) - 10;
                this.gravity = 0.5; this.alpha = 1;
                this.decayRate = 0.005;
            }
            update() {
                this.vy += this.gravity; this.x += this.vx; this.y += this.vy;
                this.alpha -= this.decayRate; if (this.alpha < 0) this.alpha = 0;
            }
            draw() {
                ctx.globalAlpha = this.alpha;
                const halfSize = this.size / 2;

                // Disegna il bordo nero (leggermente più grande)
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(this.x, this.y - halfSize - 1);
                ctx.lineTo(this.x + halfSize + 1, this.y);
                ctx.lineTo(this.x, this.y + halfSize + 1);
                ctx.lineTo(this.x - halfSize - 1, this.y);
                ctx.closePath();
                ctx.stroke();

                // Disegna il rombo giallo
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.moveTo(this.x, this.y - halfSize);
                ctx.lineTo(this.x + halfSize, this.y);
                ctx.lineTo(this.x, this.y + halfSize);
                ctx.lineTo(this.x - halfSize, this.y);
                ctx.closePath();
                ctx.fill();

                ctx.globalAlpha = 1;
            }
            isDead() { return this.alpha <= 0 || this.y > canvas.height + this.size; }
        }
    
        function createParticleFountain(count) {
            resizeCanvas();
            const startX = canvas.width / 2; const startY = canvas.height / 2;
            for (let i = 0; i < count; i++) { particles.push(new Particle(startX, startY)); }
            const intervalId = setInterval(() => {
                for (let i = 0; i < count / 20; i++) { particles.push(new Particle(startX, startY)); }
            }, 100);
            setTimeout(() => clearInterval(intervalId), 3000);
            if (!animationFrameId) { particleLoop(); }
        }
        
        function stopParticleAnimation() { particles = []; }
    
        function startSpinAnimation() {
            isSpinning = true; spinButton.disabled = true; resultDisplay.textContent = "";
            reels.forEach(reel => {
                reel.classList.add('spinning');
                const interval = setInterval(() => {
                    const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
                    reel.innerHTML = `<img src="${randomSymbol}" alt="symbol">`;
                }, 100);
                reel.dataset.intervalId = interval;
            });
        }
    
        function stopSpinAnimation(finalSymbols) {
            spinTimeoutIds.forEach(id => clearTimeout(id)); spinTimeoutIds = [];
            reels.forEach((reel, index) => {
                const timeoutId = setTimeout(() => {
                    clearInterval(reel.dataset.intervalId);
                    reel.classList.remove('spinning');
                    reel.innerHTML = `<img src="${finalSymbols[index]}" alt="symbol">`;
                    if(index === reels.length - 1) {
                       checkWin(finalSymbols);
                       isSpinning = false; spinButton.disabled = false;
                    }
                }, index * 400 + 1000);
                spinTimeoutIds.push(timeoutId);
            });
        }
    
        function checkWin(finalSymbols) {
            const [r1, r2, r3] = finalSymbols;
            if (r1 === sevenSymbol && r2 === sevenSymbol && r3 === sevenSymbol) {
                resultDisplay.innerHTML = '<span class="emoji">⚠</span> JACKPOT! 777 <span class="emoji">🎉</span>';
                createParticleFountain(500);
            } else if (r1 === r2 && r2 === r3) {
                resultDisplay.innerHTML = '<span class="emoji">☺</span> HAI FATTO TRIS!';
                createParticleFountain(200);
            } else {
                resultDisplay.innerHTML = '<span class="emoji">✖</span> RITENTA...';
            }
        }
    
        function spin() {
            if (isSpinning) return;
            stopParticleAnimation(); startSpinAnimation();
            let finalSymbols;
            if (Math.random() < 0.1) {
                let winningSymbol;
                if (Math.random() < 0.15) {
                    winningSymbol = sevenSymbol;
                } else {
                    const otherSymbols = symbols.filter(s => s !== sevenSymbol);
                    winningSymbol = otherSymbols[Math.floor(Math.random() * otherSymbols.length)];
                }
                finalSymbols = [winningSymbol, winningSymbol, winningSymbol];
            } else {
                let r1, r2, r3;
                do {
                    r1 = symbols[Math.floor(Math.random() * symbols.length)];
                    r2 = symbols[Math.floor(Math.random() * symbols.length)];
                    r3 = symbols[Math.floor(Math.random() * symbols.length)];
                } while (r1 === r2 && r2 === r3);
                finalSymbols = [r1, r2, r3];
            }
            setTimeout(() => stopSpinAnimation(finalSymbols), 1500);
        }
