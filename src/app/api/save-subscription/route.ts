import { adminDb } from '@/lib/firebase-admin';

export async function POST(req: Request) {
  const subscription = await req.json();

  if (!subscription?.endpoint) {
    return new Response('Invalid subscription', { status: 400 });
  }

  const subId = Buffer.from(subscription.endpoint).toString('base64');

  await adminDb.collection('push_subscriptions').doc(subId).set({
    subscription,
    createdAt: new Date(),
  });

  return new Response('Subscription saved', { status: 201 });
}
