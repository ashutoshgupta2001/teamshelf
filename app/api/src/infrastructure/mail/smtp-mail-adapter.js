import nodemailer from "nodemailer";

export class SmtpMailAdapter {
  constructor(settings) {
    this.from = { name: settings.fromName, address: settings.fromAddress };
    this.transport = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      ...(settings.username
        ? { auth: { user: settings.username, pass: settings.password } }
        : {}),
    });
  }
  async send({ to, subject, text, html }) {
    const result = await this.transport.sendMail({
      from: this.from,
      to,
      subject,
      text,
      html,
    });
    return { providerMessageId: result.messageId, accepted: result.accepted };
  }
}
