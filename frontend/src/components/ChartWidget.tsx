import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Card, CardContent, CardHeader, MenuItem, Select,
    FormControl, Typography, Box, CircularProgress
} from '@mui/material';
import { TradingChart } from './TradingChart';
import type { OHLCV } from '../types';

const BACKEND_URL = 'http://localhost:8040';
const WS_URL = 'ws://localhost:8040';

const ALL_SOURCES = ['Binance', 'Bybit', 'Hyperliquid', 'Hibachi', 'Chainlink', 'Ostium'];

interface ChartWidgetProps {
    defaultSource: string;
    defaultSymbol: string;
    defaultInterval: string;
}

export const ChartWidget: React.FC<ChartWidgetProps> = ({
    defaultSource,
    defaultSymbol,
    defaultInterval
}) => {
    const [source, setSource] = useState(defaultSource);
    const [interval, setInterval] = useState(defaultInterval);
    const [intervals, setIntervals] = useState<string[]>([]);
    const [historyData, setHistoryData] = useState<OHLCV[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdate, setLastUpdate] = useState<OHLCV | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const mountedRef = useRef(true);

    // Fetch supported intervals for this source
    useEffect(() => {
        mountedRef.current = true;
        fetch(`${BACKEND_URL}/api/intervals/${source}`)
            .then(r => r.json())
            .then(data => {
                if (mountedRef.current && data.intervals) {
                    setIntervals(data.intervals);
                    // If current interval not in supported list, switch to first
                    if (!data.intervals.includes(interval)) {
                        setInterval(data.intervals[0] || '1h');
                    }
                }
            })
            .catch(err => console.error(`[${source}] Intervals fetch error:`, err));

        return () => { mountedRef.current = false; };
    }, [source]);

    // Fetch historical candles
    const fetchHistory = useCallback(async () => {
        setLoading(true);
        try {
            const endTime = Date.now();
            const startTime = endTime - (365 * 24 * 60 * 60 * 1000); // 1 year

            const res = await fetch(
                `${BACKEND_URL}/api/history/${source}?interval=${interval}&startTime=${startTime}&endTime=${endTime}`
            );
            const data = await res.json();

            if (Array.isArray(data) && mountedRef.current) {
                setHistoryData(data);
            }
        } catch (err) {
            console.error(`[${source}] History fetch error:`, err);
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [source, interval]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    // WebSocket connection for real-time updates
    useEffect(() => {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'price_update') {
                    const ohlcv = message.data as OHLCV;
                    if (ohlcv.source === source) {
                        setLastUpdate(ohlcv);
                    }
                }
            } catch (err) {
                // Ignore parse errors
            }
        };

        ws.onerror = () => {
            // Will reconnect on close
        };

        ws.onclose = () => {
            // Reconnect after 3s
            setTimeout(() => {
                if (mountedRef.current) {
                    // Component will re-render and re-connect
                }
            }, 3000);
        };

        return () => {
            ws.close();
        };
    }, [source]);

    // Format interval label
    const formatInterval = (iv: string): string => {
        const map: Record<string, string> = {
            '1': '1m', '3': '3m', '5': '5m', '15': '15m', '30': '30m',
            '60': '1h', '120': '2h', '240': '4h', '360': '6h', '720': '12h',
            'D': '1D', 'W': '1W', 'M': '1M',
        };
        return map[iv] || iv;
    };

    const selectSx = {
        color: '#b0b8c8',
        fontSize: '0.75rem',
        '.MuiOutlinedInput-notchedOutline': { borderColor: '#2a2d3e' },
        '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#4a4d6e' },
        '.MuiSelect-icon': { color: '#6b7280' },
        height: '28px',
    };

    return (
        <Card sx={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            bgcolor: '#12131a',
            border: '1px solid #1e2030',
            borderRadius: '8px',
            overflow: 'hidden',
        }}>
            <CardHeader
                title={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{
                            width: 8, height: 8, borderRadius: '50%',
                            bgcolor: loading ? '#f59e0b' : '#22c55e',
                            boxShadow: loading
                                ? '0 0 6px rgba(245, 158, 11, 0.5)'
                                : '0 0 6px rgba(34, 197, 94, 0.5)',
                        }} />
                        <Typography variant="subtitle2" sx={{
                            color: '#e2e8f0',
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            letterSpacing: '0.02em',
                        }}>
                            {source}
                        </Typography>
                        <Typography variant="caption" sx={{
                            color: '#64748b',
                            fontSize: '0.7rem',
                        }}>
                            {defaultSymbol}
                        </Typography>
                    </Box>
                }
                action={
                    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', mr: 0.5 }}>
                        <FormControl size="small" sx={{ minWidth: 90 }}>
                            <Select
                                value={source}
                                onChange={(e) => setSource(e.target.value)}
                                sx={selectSx}
                            >
                                {ALL_SOURCES.map(s => (
                                    <MenuItem key={s} value={s} sx={{ fontSize: '0.75rem' }}>{s}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl size="small" sx={{ minWidth: 65 }}>
                            <Select
                                value={interval}
                                onChange={(e) => setInterval(e.target.value)}
                                sx={selectSx}
                            >
                                {intervals.map(iv => (
                                    <MenuItem key={iv} value={iv} sx={{ fontSize: '0.75rem' }}>
                                        {formatInterval(iv)}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Box>
                }
                sx={{
                    p: '6px 10px',
                    bgcolor: '#161825',
                    borderBottom: '1px solid #1e2030',
                    minHeight: 'unset',
                    '.MuiCardHeader-action': { m: 0, alignSelf: 'center' },
                    '.MuiCardHeader-content': { overflow: 'hidden' },
                }}
            />
            <CardContent sx={{
                flex: 1,
                p: 0,
                '&:last-child': { pb: 0 },
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                {loading && historyData.length === 0 ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                        <CircularProgress size={24} sx={{ color: '#6366f1' }} />
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                            Loading {source}...
                        </Typography>
                    </Box>
                ) : (
                    <TradingChart
                        historyData={historyData}
                        lastUpdate={lastUpdate}
                        source={source}
                        symbol={defaultSymbol}
                    />
                )}
            </CardContent>
        </Card>
    );
};
