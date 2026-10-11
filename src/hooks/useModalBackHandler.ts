import { useEffect, useRef } from 'react';

/**
 * Hook to handle closing modals using the browser back button.
 * It pushes a dummy state to history when the modal opens,
 * and calls onClose when the user navigates back.
 */
export function useModalBackHandler(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const pushedStateRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      // If modal closed programmatically and we previously pushed a state, pop it
      if (pushedStateRef.current && window.history.state?.isModal) {
        pushedStateRef.current = false;
        window.history.back();
      }
      return;
    }

    // Modal opened: push history dummy state if not already marked
    pushedStateRef.current = true;
    if (!window.history.state?.isModal) {
      window.history.pushState({ isModal: true }, '');
    }

    const handlePopState = () => {
      pushedStateRef.current = false;
      onCloseRef.current();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (pushedStateRef.current && window.history.state?.isModal) {
        pushedStateRef.current = false;
        window.history.back();
      }
    };
  }, [isOpen]);
}

