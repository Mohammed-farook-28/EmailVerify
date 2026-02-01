import { resend, fromEmail } from '../config/email.js';

async function send(to: string, subject: string, html: string): Promise<void> {
  await resend.emails.send({
    from: fromEmail,
    to,
    subject,
    html,
  });
}

export async function sendVerificationCode(
  email: string,
  code: string,
): Promise<void> {
  await send(
    email,
    'Verify your EmailKit account',
    `<h2>Welcome to EmailKit!</h2>
     <p>Your verification code is:</p>
     <h1 style="font-size: 36px; letter-spacing: 8px; font-family: monospace;">${code}</h1>
     <p>This code expires in 15 minutes.</p>
     <p>If you didn't create an account, please ignore this email.</p>`,
  );
}

export async function sendPasswordResetCode(
  email: string,
  code: string,
): Promise<void> {
  await send(
    email,
    'Reset your EmailKit password',
    `<h2>Password Reset</h2>
     <p>Your password reset code is:</p>
     <h1 style="font-size: 36px; letter-spacing: 8px; font-family: monospace;">${code}</h1>
     <p>This code expires in 15 minutes.</p>
     <p>If you didn't request this, please ignore this email.</p>`,
  );
}

export async function sendEmailChangeCode(
  newEmail: string,
  code: string,
): Promise<void> {
  await send(
    newEmail,
    'Confirm your new EmailKit email address',
    `<h2>Email Change Confirmation</h2>
     <p>Your verification code is:</p>
     <h1 style="font-size: 36px; letter-spacing: 8px; font-family: monospace;">${code}</h1>
     <p>This code expires in 15 minutes.</p>
     <p>If you didn't request this change, please ignore this email.</p>`,
  );
}

export async function sendDeletionCode(
  email: string,
  code: string,
): Promise<void> {
  await send(
    email,
    'Account deletion confirmation code',
    `<h2>Account Deletion</h2>
     <p>Your account deletion confirmation code is:</p>
     <h1 style="font-size: 36px; letter-spacing: 8px; font-family: monospace;">${code}</h1>
     <p>This code expires in 15 minutes.</p>
     <p>If you didn't request this, please secure your account immediately.</p>`,
  );
}

export async function sendDeletionConfirmation(email: string): Promise<void> {
  await send(
    email,
    'Your EmailKit account has been scheduled for deletion',
    `<h2>Account Deletion Scheduled</h2>
     <p>Your account has been scheduled for deletion. You have 30 days to cancel by signing back in.</p>
     <p>After 30 days, your data will be permanently anonymized.</p>`,
  );
}

export async function sendDeletionCancelled(email: string): Promise<void> {
  await send(
    email,
    'Your EmailKit account deletion has been cancelled',
    `<h2>Account Restored</h2>
     <p>Your account deletion has been cancelled. Your account is now fully active again.</p>`,
  );
}
