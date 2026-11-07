import { type Lang } from './translations';

function getInitialLang(): Lang {
  const saved = localStorage.getItem('mindspace_lang');
  if (saved === 'en' || saved === 'ar') {
    return saved;
  }
  const browserLang = (navigator.language || (navigator.languages && navigator.languages[0]) || '').toLowerCase();
  return browserLang.startsWith('ar') ? 'ar' : 'en';
}

let currentLang: Lang = getInitialLang();

function updateLegalLang(): void {
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';

  document.querySelectorAll<HTMLElement>('.legal-en').forEach((el) => {
    el.style.display = currentLang === 'en' ? 'block' : 'none';
  });

  document.querySelectorAll<HTMLElement>('.legal-ar').forEach((el) => {
    el.style.display = currentLang === 'ar' ? 'block' : 'none';
  });

  document.querySelectorAll<HTMLElement>('.lang-toggle-btn').forEach((btn) => {
    btn.textContent = currentLang === 'en' ? 'العربية' : 'English';
    btn.setAttribute('aria-label', currentLang === 'en' ? 'Switch to Arabic' : 'التحويل إلى الإنجليزية');
  });
}

function setLanguage(lang: Lang): void {
  currentLang = lang;
  localStorage.setItem('mindspace_lang', lang);
  updateLegalLang();
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.lang-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setLanguage(currentLang === 'en' ? 'ar' : 'en');
    });
  });
  updateLegalLang();
});
