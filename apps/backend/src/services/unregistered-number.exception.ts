export class UnregisteredNumberException extends Error {
  constructor(public readonly phoneNumber: string) {
    super(`Unregistered WhatsApp number: ${phoneNumber}`);
    this.name = 'UnregisteredNumberException';
  }
}
