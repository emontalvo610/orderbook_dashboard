'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Centrifuge } from 'centrifuge';
import { JWT_TOKEN, WS_ENDPOINT } from '@/lib/env';
import { OrderSide, OrderbookData, OrderbookLevel } from '@/types/orderbook';
import { filterOrders } from '../helper/orderbook';

interface OrderbookProps {
  symbol: string;
}

const Orderbook: React.FC<OrderbookProps> = ({ symbol }) => {
  // State variables
  const [bids, setBids] = useState<OrderbookLevel[]>([]);
  const [asks, setAsks] = useState<OrderbookLevel[]>([]);
  const [lastSequence, setLastSequence] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'connecting' | 'disconnected'
  >('disconnected');
  const [changedPrices, setChangedPrices] = useState<Set<string>>(new Set());

  // Refs
  const centrifuge = useRef<Centrifuge | null>(null);
  const reconnectAttempts = useRef(0);
  const lastMessageTime = useRef(Date.now());

  // Effect for WebSocket connection setup
  useEffect(() => {
    // Initialize Centrifuge client
    centrifuge.current = new Centrifuge(WS_ENDPOINT, {
      token: JWT_TOKEN
    });

    // Event handlers for WebSocket connection
    const handleConnect = () => {
      console.info('Connected to WebSocket');
      setConnectionStatus('connected');
      reconnectAttempts.current = 0;
    };

    const handleDisconnect = (ctx: any) => {
      console.info('Disconnected from WebSocket', ctx);
      setConnectionStatus('disconnected');
      handleReconnect();
    };

    const handleConnecting = () => {
      console.info('Connecting to WebSocket');
      setConnectionStatus('connecting');
    };

    // Attach event listeners
    centrifuge.current.on('connected', handleConnect);
    centrifuge.current.on('disconnected', handleDisconnect);
    centrifuge.current.on('connecting', handleConnecting);

    // Initiate connection
    centrifuge.current.connect();

    // Set up interval to check connection status
    const intervalId = setInterval(checkConnectionStatus, 5000);

    // Cleanup function
    return () => {
      centrifuge.current?.removeListener('connected', handleConnect);
      centrifuge.current?.removeListener('disconnected', handleDisconnect);
      centrifuge.current?.removeListener('connecting', handleConnecting);
      centrifuge.current?.disconnect();
      clearInterval(intervalId);
    };
  }, []);

  // Effect for subscription management
  useEffect(() => {
    if (!centrifuge.current || connectionStatus !== 'connected') return;

    // Remove existing subscription if any
    const currentSubscription = centrifuge.current.getSubscription(
      `orderbook:${symbol}`
    );
    if (currentSubscription) {
      centrifuge.current.removeSubscription(currentSubscription);
    }

    // Create new subscription
    const subscription = centrifuge.current.newSubscription(
      `orderbook:${symbol}`
    );

    // Handle incoming orderbook updates
    const handlePublication = (message: { data: OrderbookData }) => {
      try {
        const { bids: newBids, asks: newAsks, sequence } = message.data;
        lastMessageTime.current = Date.now();

        // Check for out-of-order sequences
        if (sequence <= lastSequence) {
          console.warn('Out of order sequence received, resubscribing...');
          subscription.unsubscribe();
          subscription.subscribe();
          return;
        }

        setLastSequence(sequence);
        const changedPrices = new Set<string>();
        setBids((prevBids) =>
          mergeOrderbookLevels(prevBids, newBids, changedPrices)
        );
        setAsks((prevAsks) =>
          mergeOrderbookLevels(prevAsks, newAsks, changedPrices)
        );
        setChangedPrices(changedPrices);
      } catch (error) {
        console.error('Error processing orderbook update:', error);
      }
    };

    // Attach event listeners to subscription
    subscription.on('publication', handlePublication);
    subscription.on('subscribed', () => {
      console.info(`Subscribed to orderbook:${symbol}`);
    });
    subscription.on('error', (error: any) => {
      console.error(`Subscription error for orderbook:${symbol}:`, error);
    });

    // Subscribe to the channel
    subscription.subscribe();

    // Cleanup function
    return () => {
      subscription.unsubscribe();
    };
  }, [symbol, connectionStatus]);

  // Function to handle reconnection attempts
  const handleReconnect = useCallback(() => {
    const backoffTime = Math.min(
      1000 * Math.pow(2, reconnectAttempts.current),
      30000
    );
    setTimeout(() => {
      if (connectionStatus !== 'connected') {
        reconnectAttempts.current++;
        console.warn(
          `Attempting to reconnect (attempt ${reconnectAttempts.current})`
        );
        centrifuge.current?.connect();
      }
    }, backoffTime);
  }, [connectionStatus, centrifuge]);

  // Function to check connection status and trigger reconnect if needed
  const checkConnectionStatus = useCallback(() => {
    const now = Date.now();

    if (
      now - lastMessageTime.current > 10000 &&
      connectionStatus === 'connected'
    ) {
      console.info(
        'No messages received for 10 seconds, attempting to reconnect'
      );
      centrifuge.current?.disconnect();
      handleReconnect();
    }
  }, [connectionStatus, lastMessageTime, handleReconnect, centrifuge]);

  // Function to merge orderbook levels
  const mergeOrderbookLevels = useCallback(
    (
      existing: OrderbookLevel[],
      updates: OrderbookLevel[],
      changedPrices: Set<string>
    ): OrderbookLevel[] => {
      const merged = [...existing];

      updates.forEach(([price, size]) => {
        const index = merged.findIndex((level) => level[0] === price);

        if (index !== -1) {
          if (size === '0') {
            merged.splice(index, 1);
          } else {
            merged[index] = [price, size];
          }
          changedPrices.add(price);
        } else if (size !== '0') {
          merged.push([price, size]);
          changedPrices.add(price);
        }
      });

      return merged.sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
    },
    []
  );

  // Function to render orderbook side (bids or asks)
  const renderOrderbookSide = useCallback(
    (orders: OrderbookLevel[], side: OrderSide) => {
      const filteredOrders = filterOrders(orders, side);
      return (
        <div className="w-full">
          {filteredOrders?.map(({ price, size, total, percentage }) => {
            return (
              <div key={price} className="flex text-xs py-0.5 relative">
                <span
                  className={`w-1/3 ${side === 'bids' ? 'text-green-400' : 'text-red-400'} ${
                    changedPrices.has(price)
                      ? 'bg-gray-700 transition-colors duration-500'
                      : ''
                  }`}
                >
                  {price}
                </span>
                <span className="w-1/3 text-right text-gray-300">{size}</span>
                <span className="w-1/3 text-right text-gray-300 relative z-10">
                  {total}
                </span>
                <div
                  className={`absolute top-0 bottom-0 right-0 ${side === 'bids' ? 'bg-green-900' : 'bg-red-900'}`}
                  style={{ width: `${percentage}%`, opacity: 0.3 }}
                ></div>
              </div>
            );
          })}
        </div>
      );
    },
    [filterOrders, changedPrices]
  );

  // Render the component
  return (
    <div className="max-w-md mx-auto p-4 bg-gray-900 rounded-lg shadow-xl text-gray-100">
      <div className="flex justify-between items-center text-xs mb-1  text-white">
        <h2 className="text-lg font-bold text-center mb-2">
          {symbol} Orderbook
        </h2>
        <span
          className={`ml-2 px-2 py-1 rounded ${
            connectionStatus === 'connected'
              ? 'bg-green-600'
              : connectionStatus === 'connecting'
                ? 'bg-yellow-600'
                : 'bg-red-600'
          }`}
        >
          {connectionStatus}
        </span>
      </div>
      <div className="flex justify-between items-center text-xs mb-1 text-white">
        <span>Price USD</span>
        <span>Amount BTC</span>
        <span>Total BTC</span>
      </div>
      <div className="space-y-1">
        {renderOrderbookSide(asks, 'asks')}
        {renderOrderbookSide(bids, 'bids')}
      </div>
    </div>
  );
};

export default Orderbook;
