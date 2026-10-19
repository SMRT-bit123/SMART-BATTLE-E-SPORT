import { useEffect, useRef } from 'react';

/**
 * Hook to handle closing modals using the Android hardware / browser back button.
 * Safely manages history state so that closing via the on-screen 'X' button
 * or closing programmatically never causes unintended navigation back to login
 * or duplicate history pops.
 */
export function useModalBackHandler(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const modalIdRef = useRef<string>('');
  const isPushedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      // Modal closed via UI (e.g. X button, backdrop click)
      if (isPushedRef.current) {
        isPushedRef.current = false;
        // Only pop if the current top history state is indeed this modal's dummy entry
        if (typeof window !== 'undefined' && window.history.state?.sbModalId === modalIdRef.current) {
          window.history.back();
        }
      }
      return;
    }

    // Modal opened: create unique ID and push history entry if not already set
    const uniqueId = 'modal_' + Math.random().toString(36).substring(2, 9);
    modalIdRef.current = uniqueId;
    isPushedRef.current = true;

    try {
      window.history.pushState(
        { ...(window.history.state || {}), sbModalId: uniqueId },
        ''
      );
    } catch {
      // Ignore if pushState is restricted
    }

    const handlePopState = (event: PopStateEvent) => {
      // User pressed browser/hardware back button:
      // The history entry was already popped by the browser.
      if (isPushedRef.current) {
        isPushedRef.current = false;
        onCloseRef.current();
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (isPushedRef.current) {
        isPushedRef.current = false;
        if (typeof window !== 'undefined' && window.history.state?.sbModalId === modalIdRef.current) {
          window.history.back();
        }
      }
    };
  }, [isOpen]);
}

