import { OrderSide, OrderbookLevel } from '@/types/orderbook';

const MAX_ORDERBOOK_LENGTH = 11;

const calculateTotalBTC = (
  entries: OrderbookLevel[],
  index: number
): number => {
  return entries
    .slice(0, index + 1)
    .reduce((total, [, size]) => total + parseFloat(size), 0);
};

export const filterOrders = (orders: OrderbookLevel[], side: OrderSide) => {
  if (side === 'bids') {
    const maxTotal = calculateTotalBTC(orders, MAX_ORDERBOOK_LENGTH - 1);

    return orders.slice(0, MAX_ORDERBOOK_LENGTH).map(([price, size], index) => {
      const total = calculateTotalBTC(orders, index);

      return {
        price: price,
        size: parseFloat(size).toFixed(4),
        total: total.toFixed(4),
        percentage: (total / maxTotal) * 100
      };
    });
  } else if (side === 'asks') {
    const newOrders = orders.slice().reverse().slice(0, MAX_ORDERBOOK_LENGTH);
    const maxTotal = calculateTotalBTC(newOrders, MAX_ORDERBOOK_LENGTH - 1);

    return newOrders
      .map(([price, size], index) => {
        const total = calculateTotalBTC(newOrders, index);

        return {
          price: price,
          size: parseFloat(size).toFixed(4),
          total: total.toFixed(4),
          percentage: (total / maxTotal) * 100
        };
      })
      .reverse();
  }
};
