'use client';

import { useState, useEffect } from 'react';

/**
 * Detects if the mobile virtual keyboard is likely open.
 * Uses window.visualViewport height reduction (>120px) or focused editable element.
 */
export function useVirtualKeyboard(): boolean {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkViewport = () => {
      if (window.visualViewport) {
        const heightDiff = window.innerHeight - window.visualViewport.height;
        // Keyboard typically occupies at least 150px
        if (heightDiff > 120) {
          setIsOpen(true);
          return;
        }
      }

      const activeEl = document.activeElement;
      const isEditable =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl instanceof HTMLElement && activeEl.isContentEditable);

      setIsOpen(Boolean(isEditable));
    };

    const handleFocusChange = () => {
      // Small timeout to allow visualViewport resize or blur to settle
      setTimeout(checkViewport, 100);
    };

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', checkViewport);
    }
    window.addEventListener('focusin', handleFocusChange);
    window.addEventListener('focusout', handleFocusChange);

    return () => {
      if (vv) {
        vv.removeEventListener('resize', checkViewport);
      }
      window.removeEventListener('focusin', handleFocusChange);
      window.removeEventListener('focusout', handleFocusChange);
    };
  }, []);

  return isOpen;
}
