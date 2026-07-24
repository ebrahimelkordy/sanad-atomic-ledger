export class InsufficientStockException extends Error {
  constructor(message: string = 'Insufficient stock for the requested items') {
    super(message);
    this.name = 'InsufficientStockException';
  }
}
