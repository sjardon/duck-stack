export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface IEmailSender {
  send(message: EmailMessage): Promise<void>;
}
