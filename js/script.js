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

