import { Resend } from 'resend';
import { env } from './env.js';

export const resend = new Resend(env.resendApiKey);
export const fromEmail = env.fromEmail;
