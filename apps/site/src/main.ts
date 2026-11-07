import { links } from './links';
import { translations, type Lang } from './translations';

function getInitialLang(): Lang {
  const saved = localStorage.getItem('mindspace_lang');
  if (saved === 'en' || saved === 'ar') {
    return saved;
  }
  const browserLang = (navigator.language || (navigator.languages && navigator.languages[0]) || '').toLowerCase();
  return browserLang.startsWith('ar') ? 'ar' : 'en';
}

let currentLang: Lang = getInitialLang();

function getNestedValue(obj: any, path: string): string | undefined {
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

function updateContent(): void {
  const dict = translations[currentLang];
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';

  // Update text content
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) {
      const val = getNestedValue(dict, key);
      if (typeof val === 'string') {
        el.textContent = val;
      }
    }
  });

  // Update attributes like placeholders or titles
  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) {
      const val = getNestedValue(dict, key);
      if (typeof val === 'string') {
        el.setAttribute('title', val);
      }
    }
  });

  // Update language toggle button text
  document.querySelectorAll<HTMLElement>('.lang-toggle-btn').forEach((btn) => {
    btn.textContent = dict.nav.langToggle;
    btn.setAttribute('aria-label', currentLang === 'en' ? 'Switch to Arabic' : 'التحويل إلى الإنجليزية');
  });

  // Update download link buttons according to links.ts and current language
  updateLinksUI();
}

function updateLinksUI(): void {
  const dict = translations[currentLang];
  const keys: (keyof typeof links)[] = ['ios', 'android', 'extension', 'webApp'];

  keys.forEach((key) => {
    const url = links[key]?.trim();
    const elements = document.querySelectorAll<HTMLElement>(`[data-app-link="${key}"]`);

    elements.forEach((el) => {
      if (url) {
        if (el.tagName.toLowerCase() !== 'a') {
          const anchor = document.createElement('a');
          anchor.className = el.className;
          anchor.classList.remove('is-disabled');
          anchor.href = url;
          anchor.target = '_blank';
          anchor.rel = 'noopener noreferrer';
          anchor.setAttribute('data-app-link', key);
          anchor.innerHTML = el.innerHTML;
          const badge = anchor.querySelector('.badge-coming-soon');
          if (badge) badge.remove();
          el.replaceWith(anchor);
        } else {
          (el as HTMLAnchorElement).href = url;
          (el as HTMLAnchorElement).target = '_blank';
          (el as HTMLAnchorElement).rel = 'noopener noreferrer';
          (el as HTMLAnchorElement).removeAttribute('aria-disabled');
          el.classList.remove('is-disabled');
          const badge = el.querySelector('.badge-coming-soon');
          if (badge) badge.remove();
        }
      } else {
        // Empty value renders "Coming soon", never a dead link
        if (el.tagName.toLowerCase() === 'a') {
          const span = document.createElement('span');
          span.className = el.className;
          span.classList.add('is-disabled');
          span.setAttribute('data-app-link', key);
          span.setAttribute('role', 'status');
          span.setAttribute('aria-disabled', 'true');
          span.innerHTML = el.innerHTML;
          el.replaceWith(span);
        } else {
          el.classList.add('is-disabled');
          el.setAttribute('aria-disabled', 'true');
        }
        const badge = el.querySelector('.badge-status');
        if (badge) {
          badge.textContent = dict.download.comingSoonBadge;
          (badge as HTMLElement).style.display = 'inline-block';
        }
      }
    });
  });
}

function setLanguage(lang: Lang): void {
  currentLang = lang;
  localStorage.setItem('mindspace_lang', lang);
  updateContent();
}

function initPricingTabs(): void {
  const monthlyBtn = document.getElementById('pricing-tab-monthly');
  const packsBtn = document.getElementById('pricing-tab-packs');
  const monthlyGrid = document.getElementById('pricing-grid-monthly');
  const packsGrid = document.getElementById('pricing-grid-packs');

  if (!monthlyBtn || !packsBtn || !monthlyGrid || !packsGrid) return;

  monthlyBtn.addEventListener('click', () => {
    monthlyBtn.classList.add('active');
    monthlyBtn.setAttribute('aria-selected', 'true');
    packsBtn.classList.remove('active');
    packsBtn.setAttribute('aria-selected', 'false');
    monthlyGrid.classList.remove('is-hidden');
    packsGrid.classList.add('is-hidden');
  });

  packsBtn.addEventListener('click', () => {
    packsBtn.classList.add('active');
    packsBtn.setAttribute('aria-selected', 'true');
    monthlyBtn.classList.remove('active');
    monthlyBtn.setAttribute('aria-selected', 'false');
    packsGrid.classList.remove('is-hidden');
    monthlyGrid.classList.add('is-hidden');
  });
}

function initMobileMenu(): void {
  const menuToggle = document.getElementById('mobile-menu-toggle');
  const navMenu = document.getElementById('primary-nav');

  if (!menuToggle || !navMenu) return;

  menuToggle.addEventListener('click', () => {
    const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!isExpanded));
    navMenu.classList.toggle('nav-open', !isExpanded);
  });

  // Close menu when a link inside is clicked
  navMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      menuToggle.setAttribute('aria-expanded', 'false');
      navMenu.classList.remove('nav-open');
    });
  });
}

// Initialise everything once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Bind language toggles
  document.querySelectorAll('.lang-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setLanguage(currentLang === 'en' ? 'ar' : 'en');
    });
  });

  initPricingTabs();
  initMobileMenu();
  updateContent();
});
