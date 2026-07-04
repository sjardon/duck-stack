export interface IEmailNotifier {
  send(params: { to: string; subject: string; html: string }): Promise<void>;
}
