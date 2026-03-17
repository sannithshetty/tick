import React from 'react';
import { Grid } from '@mui/material';
import { ChartWidget } from './ChartWidget';

interface WindowConfig {
    source: string;
    symbol: string;
    defaultInterval: string;
}

const WINDOWS: WindowConfig[] = [
    { source: 'Binance', symbol: 'BTCUSDT', defaultInterval: '1h' },
    { source: 'Bybit', symbol: 'BTCUSDT', defaultInterval: '60' },
    { source: 'Hyperliquid', symbol: 'BTC', defaultInterval: '1h' },
    { source: 'Hibachi', symbol: 'BTC_USDT', defaultInterval: '1h' },
    { source: 'Chainlink', symbol: 'BTCUSD', defaultInterval: '1h' },
    { source: 'Ostium', symbol: 'BTCUSD', defaultInterval: '1m' },
];

export const GridContainer: React.FC = () => {
    return (
        <Grid container spacing={0.5} sx={{ height: '100vh', p: 0.5, bgcolor: '#0a0a0f' }}>
            {WINDOWS.map((win, idx) => (
                <Grid key={idx} size={4} sx={{ height: '50%' }}>
                    <ChartWidget
                        defaultSource={win.source}
                        defaultSymbol={win.symbol}
                        defaultInterval={win.defaultInterval}
                    />
                </Grid>
            ))}
        </Grid>
    );
};
