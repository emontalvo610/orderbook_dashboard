export type OrderbookLevel = [string, string];

export type OrderSide = 'bids' | 'asks';

export interface OrderbookData {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  sequence: number;
}
