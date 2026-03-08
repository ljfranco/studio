import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

// Inicializa Firebase Admin (evita inicializarlo múltiples veces)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name, address, phone } = body;

    // 1. Crear usuario en Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

    // 2. Crear documento en Firestore
    await db.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      name,
      email,
      address: address || null,
      phone: phone || null,
      role: 'user',
      balance: 0,
      isEnabled: true,
      createdAt: admin.firestore.Timestamp.now(),
    });

    return NextResponse.json({ success: true, uid: userRecord.uid });
  } catch (error: any) {
    console.error('Error creando usuario:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}