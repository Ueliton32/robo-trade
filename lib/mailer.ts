import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null | undefined;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter !== undefined) return transporter;

  const host = process.env.SMTP_HOST;
  if (!host) {
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true', // true para porta 465, false para 587/STARTTLS
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  return transporter;
}

export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<void> {
  const t = getTransporter();
  if (!t) {
    console.warn(
      '[mailer] SMTP não configurado — alerta por e-mail ignorado. ' +
      'Defina SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS e EMAIL_FROM no .env para habilitar envio.'
    );
    return;
  }

  await t.sendMail({
    from: process.env.EMAIL_FROM ?? 'Robô Trade <noreply@localhost>',
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
}
