import { Auth, EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail, updatePassword, User } from 'firebase/auth';

export async function reauthenticateAndUpdatePassword(
  user: User,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const credential = EmailAuthProvider.credential(user.email || '', currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export async function sendPasswordReset(auth: Auth, email: string): Promise<void> {
  if (!email) {
    throw new Error('Debes proporcionar un correo electrónico.');
  }

  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error: any) {
    throw error;
  }
}
