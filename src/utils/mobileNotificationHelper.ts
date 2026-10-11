import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

// Register Service Worker for Mobile Notifications
export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/'
    });
    return registration;
  } catch (err) {
    console.warn('Service Worker registration failed:', err);
    return null;
  }
}

// Request Notification Permission from User & Sync with Firestore
export async function requestMobileNotificationPermission(userId?: string): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    alert('Notifications are not supported on this browser/device.');
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    
    if (permission === 'granted') {
      // Ensure SW is registered and ready
      await registerNotificationServiceWorker();

      // Update Firestore user document
      if (userId) {
        await updateDoc(doc(db, 'users', userId), {
          fcmEnabled: true,
          notificationsEnabled: true
        }).catch(() => {});
      }

      // Trigger a quick welcome notification into the mobile status bar
      triggerMobileStatusBarNotification(
        '🔔 Mobile Notifications Enabled!',
        'You will now receive instant Room ID, Password, and Match alerts directly in your phone status bar.',
        { tag: 'welcome-notification' }
      );
    }
    
    return permission;
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return 'denied';
  }
}

export interface MobileNotificationOptions {
  tag?: string;
  targetMatchId?: string;
  actionPage?: string;
  icon?: string;
  badge?: string;
  data?: any;
}

// Trigger Native Mobile Status Bar & Lock Screen Notification
export async function triggerMobileStatusBarNotification(
  title: string,
  body: string,
  options: MobileNotificationOptions = {}
) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return;
  }

  if (Notification.permission !== 'granted') {
    return;
  }

  const notifData = {
    url: window.location.origin,
    targetMatchId: options.targetMatchId,
    actionPage: options.actionPage,
    ...(options.data || {})
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: options.icon || '/icon.svg',
          badge: options.badge || '/icon.svg',
          vibrate: [250, 100, 250, 100, 250],
          tag: options.tag || `khel-galli-${Date.now()}`,
          renotify: true,
          data: notifData
        } as any);
        return;
      }
    }

    // Standard fallback if SW ready didn't resolve
    new Notification(title, {
      body,
      icon: options.icon || '/icon.svg',
      tag: options.tag || `khel-galli-${Date.now()}`
    });
  } catch (err) {
    console.warn('Native mobile notification trigger failed:', err);
  }
}
