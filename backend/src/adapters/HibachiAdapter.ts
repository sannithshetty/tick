import WebSocket from 'ws';
import axios from 'axios';
import { DataAdapter, OHLCV } from './DataAdapter';

const HIBACHI_REST = 'https://api.hibachi.xyz';

export class HibachiAdapter extends DataAdapter {
    private ws: WebSocket | null = null;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private pingInterval: NodeJS.Timeout | null = null;

    constructor(public symbol: string = 'BTC_USDT', public interval: string = '5m') {
        super('Hibachi');
    }

    get supportedIntervals(): string[] {
        return ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
    }

    /** Map interval to Hibachi kline format (seconds) */
    private intervalToSeconds(interval: string): number {
        const map: Record<string, number> = {
            '1m': 60, '5m': 300, '15m': 900, '30m': 1800,
            '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800,
        };
        return map[interval] || 300;
    }

    async connect(): Promise<void> {
        const url = 'wss://api.hibachi.xyz/ws/market';
        console.log(`[Hibachi] Connecting to ${url}`);

        try {
            this.ws = new WebSocket(url);

            this.ws.on('open', () => {
                console.log(`[Hibachi] Connected`);
                // Subscribe to kline/candle updates
                const subscribeMsg = {
                    op: 'subscribe',
                    channel: 'kline',
                    symbol: this.symbol,
                    interval: this.interval,
                };
                this.ws?.send(JSON.stringify(subscribeMsg));

                this.pingInterval = setInterval(() => {
                    if (this.ws?.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify({ op: 'ping' }));
                    }
                }, 30000);
            });

            this.ws.on('message', (data: WebSocket.Data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    // Handle kline data - adapt based on actual Hibachi WS format
                    if (msg.channel === 'kline' && msg.data) {
                        const k = msg.data;
                        const ohlcv: OHLCV = {
                            timestamp: k.t || k.timestamp || Date.now(),
                            open: parseFloat(k.o || k.open || '0'),
                            high: parseFloat(k.h || k.high || '0'),
                            low: parseFloat(k.l || k.low || '0'),
                            close: parseFloat(k.c || k.close || '0'),
                            volume: parseFloat(k.v || k.volume || '0'),
                            source: 'Hibachi',
                            symbol: this.symbol,
                        };
                        this.emit('data', ohlcv);
                    }
                } catch (err) {
                    // Ignore parse errors
                }
            });

            this.ws.on('close', () => {
                console.log(`[Hibachi] Disconnected. Reconnecting in 5s...`);
                if (this.pingInterval) clearInterval(this.pingInterval);
                this.reconnectTimer = setTimeout(() => this.connect(), 5000);
            });

            this.ws.on('error', (err) => {
                console.error(`[Hibachi] WS Error:`, err.message);
                this.ws?.close();
            });
        } catch (err: any) {
            console.error(`[Hibachi] Connect error:`, err.message);
            this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        }
    }

    async disconnect(): Promise<void> {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.ws?.removeAllListeners();
        this.ws?.close();
    }

    async fetchHistory(interval: string, startTime: number, endTime: number): Promise<OHLCV[]> {
        const allCandles: OHLCV[] = [];
        let currentStart = startTime;
        const limit = 500;

        console.log(`[Hibachi] Fetching history ${interval} from ${new Date(startTime).toISOString()}`);

        while (currentStart < endTime) {
            try {
                // Hibachi REST API kline endpoint — public, no auth required
                const { data } = await axios.get(`${HIBACHI_REST}/v1/market/klines`, {
                    params: {
                        symbol: this.symbol,
                        interval: this.intervalToSeconds(interval),
                        startTime: Math.floor(currentStart / 1000),
                        endTime: Math.floor(endTime / 1000),
                        limit,
                    },
                    timeout: 10000,
                });

                const klines = data?.data || data?.result || data;
                if (!klines || !Array.isArray(klines) || klines.length === 0) break;

                for (const k of klines) {
                    const ts = (k.t || k.timestamp || k.openTime || 0);
                    // Timestamps could be in seconds, convert to ms
                    const tsMs = ts < 1e12 ? ts * 1000 : ts;
                    allCandles.push({
                        timestamp: tsMs,
                        open: parseFloat(k.o || k.open || '0'),
                        high: parseFloat(k.h || k.high || '0'),
                        low: parseFloat(k.l || k.low || '0'),
                        close: parseFloat(k.c || k.close || '0'),
                        volume: parseFloat(k.v || k.volume || '0'),
                        source: 'Hibachi',
                        symbol: this.symbol,
                    });
                }

                const lastTs = allCandles[allCandles.length - 1].timestamp;
                currentStart = lastTs + 1;

                if (klines.length < limit) break;
                await new Promise(r => setTimeout(r, 200));
            } catch (err: any) {
                console.error('[Hibachi] History fetch error:', err.message);
                break;
            }
        }

        allCandles.sort((a, b) => a.timestamp - b.timestamp);
        console.log(`[Hibachi] Fetched ${allCandles.length} candles`);
        return allCandles;
    }
}
