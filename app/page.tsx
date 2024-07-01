import React from 'react';
import Orderbook from '@/components/Orderbook';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-200 py-8">
      <Orderbook symbol="BTC-USD" />
    </div>
  );
};

export default App;
