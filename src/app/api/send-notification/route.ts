import webpush from 'web-push';
import { adminDb } from '@/lib/firebase-admin';

webpush.setVapidDetails(
    'mailto:admin@easymanage.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: Request) {
    const { title, body } = await req.json();

    const snapshot = await adminDb.collection('push_subscriptions').get();

    const payload = JSON.stringify({
        title: title || 'EasyManage',
        body: body || '¡Tienes una nueva notificación!',
    });

    const results = await Promise.allSettled(
        snapshot.docs.map(async (doc) => {
            const subscription = doc.data().subscription;

            try {
                await webpush.sendNotification(subscription, payload);
                return { success: true };
            } catch (error: any) {
                const statusCode = error.statusCode || error.status;
                if (statusCode === 410 || statusCode === 404) {
                    await doc.ref.delete();
                    console.warn('🧹 Suscripción inválida eliminada:', doc.id);
                    return { success: false, deleted: true };
                }

                console.error('❌ Error al enviar notificación:', error);
                return { success: false, error: error.message || 'Error desconocido' };
            }
        })
    );

    return Response.json({ success: true, results });
}
