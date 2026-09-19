/**
 * Web Push Notification Client Service for ApplyFlow.
 * Handles Service Worker registration, VAPID key exchange, subscription lifecycle,
 * and background notification permissions.
 */

import api from '@/services/api';

// Standard uncompressed P-256 VAPID public key (65 bytes, base64url encoded)
export const DEFAULT_VAPID_PUBLIC_KEY =
  'BGSl6ZcyzkyfropuFTnD3QmkTdJTCLwaWIN_8CjLtRWVwmLrledjYu2aaHoKWd9urmUIOfzpo-9aV55nJVfxpfU';

/**
 * Validates whether a Uint8Array contains a valid uncompressed P-256 EC public key.
 * By W3C specification, uncompressed P-256 keys must be exactly 65 bytes and start with 0x04.
 */
export function isValidP256PublicKey(uint8Array) {
  return (
    uint8Array &&
    uint8Array instanceof Uint8Array &&
    uint8Array.length === 65 &&
    uint8Array[0] === 0x04
  );
}

/**
 * Converts a URL-safe Base64 string to a Uint8Array for PushManager applicationServerKey.
 */
export function urlBase64ToUint8Array(base64String) {
  if (!base64String || typeof base64String !== 'string') {
    throw new Error('Invalid VAPID public key: must be a non-empty string.');
  }

  const cleaned = base64String.trim().replace(/^["']|["']$/g, '');
  const padding = '='.repeat((4 - (cleaned.length % 4)) % 4);
  const base64 = (cleaned + padding).replace(/-/g, '+').replace(/_/g, '/');

  let rawData;
  try {
    rawData = window.atob(base64);
  } catch (e) {
    throw new Error(`Failed to decode VAPID public key: ${e.message}`);
  }

  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if the current browser environment supports Service Workers and Web Push.
 */
export function isPushNotificationSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Get current browser notification permission status ('default', 'granted', 'denied').
 */
export function getNotificationPermission() {
  if (!isPushNotificationSupported()) return 'denied';
  return Notification.permission;
}

/**
 * Register the ApplyFlow Service Worker (/sw.js).
 */
export async function registerServiceWorker() {
  if (!isPushNotificationSupported()) return null;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    // Check for Service Worker updates immediately
    if (registration && typeof registration.update === 'function') {
      registration.update().catch(() => {});
    }
    return registration;
  } catch (err) {
    console.warn('[PushNotifications] Service worker registration failed:', err);
    return null;
  }
}

/**
 * Prompt user for notification permission and register push subscription with backend.
 */
export async function subscribeToPushNotifications() {
  if (!isPushNotificationSupported()) {
    throw new Error('Web Push Notifications are not supported in this browser.');
  }

  // 1. Request Notification permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { success: false, permission, reason: 'Permission not granted' };
  }

  // 2. Ensure Service Worker is active
  let registration = await navigator.serviceWorker.ready;
  if (!registration) {
    registration = await registerServiceWorker();
    registration = await navigator.serviceWorker.ready;
  }

  // 3. Retrieve VAPID Public Key from backend (with verification & fallback)
  let applicationServerKey = null;
  try {
    const vapidRes = await api.get('/chat/push/vapid-public-key');
    const serverKey = vapidRes.data?.public_key;
    if (serverKey) {
      const candidateKey = urlBase64ToUint8Array(serverKey);
      if (isValidP256PublicKey(candidateKey)) {
        applicationServerKey = candidateKey;
      } else {
        console.warn(
          '[PushNotifications] Server VAPID key is not a valid 65-byte P-256 key, falling back to default.'
        );
      }
    }
  } catch (err) {
    console.warn('[PushNotifications] Could not fetch VAPID key from backend, using default fallback:', err);
  }

  // Fall back to verified default VAPID key if backend key was missing or malformed
  if (!applicationServerKey) {
    applicationServerKey = urlBase64ToUint8Array(DEFAULT_VAPID_PUBLIC_KEY);
  }

  // 4. Subscribe or renew with browser PushManager
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    } catch (subErr) {
      console.warn('[PushNotifications] Subscription attempt failed, clearing stale subscription:', subErr);
      const staleSub = await registration.pushManager.getSubscription().catch(() => null);
      if (staleSub) {
        await staleSub.unsubscribe().catch(() => {});
      }
      // Retry once after clearing stale subscription
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }
  }

  // 5. Serialize subscription keys
  const subJson = subscription.toJSON();
  const endpoint = subJson.endpoint;
  const p256dh = subJson.keys?.p256dh;
  const auth = subJson.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Incomplete push subscription generated by browser.');
  }

  // 6. Send subscription to ApplyFlow backend
  await api.post('/chat/push/subscribe', {
    endpoint,
    keys: {
      p256dh,
      auth,
    },
  });

  return { success: true, permission, subscription };
}

/**
 * Unsubscribe this browser device from Push Notifications.
 */
export async function unsubscribeFromPushNotifications() {
  if (!isPushNotificationSupported()) return { success: false };

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await api.delete('/chat/push/unsubscribe', {
        data: { endpoint },
      });
    }

    return { success: true };
  } catch (err) {
    console.error('[PushNotifications] Failed to unsubscribe:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Initializes push notifications silently if permission has already been granted.
 * Call this on app load / after login.
 */
export async function initPushNotifications() {
  if (!isPushNotificationSupported()) return;

  try {
    await registerServiceWorker();

    if (Notification.permission === 'granted') {
      await subscribeToPushNotifications();
    }
  } catch (err) {
    console.debug('[PushNotifications] Silent push init:', err.message);
  }
}
