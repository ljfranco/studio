'use client';

import { useEffect } from 'react';

export function useAdminPushSubscription() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (Notification.permission === 'default') {
      Notification.requestPermission().then(async (permission) => {
        if (permission !== 'granted') return;

        try {
          const registration = await navigator.serviceWorker.ready;

          const res = await fetch('/api/public-vapid-key');
          const { publicKey } = await res.json();

          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });

          await fetch('/api/save-subscription', {
            method: 'POST',
            body: JSON.stringify(subscription),
            headers: {
              'Content-Type': 'application/json',
            },
          });

          //console.log('✅ Suscripción guardada en Firestore');
        } catch (err) {
          //console.error('❌ Error al suscribirse al push manager', err);
        }
      });
    }
  }, []);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}
