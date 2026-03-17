import WebSocket from 'ws';
import axios from 'axios';
import { DataAdapter, OHLCV } from './DataAdapter';

const HL_API = 'https://api.hyperliquid.xyz/info';

export class HyperliquidAdapter extends DataAdapter {
    private ws: WebSocket | null = null;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private pingInterval: NodeJS.Timeout | null = null;

    constructor(public coin: string = 'BTC') {
        super('Hyperliquid');
    }

    get supportedIntervals(): string[] {
        return ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '8h', '12h', '1d', '3d', '1w', '1M'];
    }

    async connect(): Promise<void> {
        const url = 'wss://api.hyperliquid.xyz/ws';
        console.log(`[Hyperliquid] Connecting to ${url}`);

        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            console.log(`[Hyperliquid] Connected`);
            // Subscribe to candles instead of l2Book for proper OHLCV
            const subscribeMsg = {
                method: 'subscribe',
                subscription: { type: 'candle', coin: this.coin, interval: '5m' }
            };
            this.ws?.send(JSON.stringify(subscribeMsg));

            this.pingInterval = setInterval(() => {
                if (this.ws?.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ method: 'ping' }));
                }
            }, 50000);
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.channel === 'candle' && msg.data) {
                    const k = msg.data;
                    const ohlcv: OHLCV = {
                        timestamp: k.t,
                        open: parseFloat(k.o),
                        high: parseFloat(k.h),
                        low: parseFloat(k.l),
                        close: parseFloat(k.c),
                        volume: parseFloat(k.v),
                        source: 'Hyperliquid',
                        symbol: this.coin,
                    };
                    this.emit('data', ohlcv);
                } else if (msg.channel === 'l2Book' && msg.data) {
                    // Fallback: derive tick from l2Book
                    const { levels } = msg.data;
                    if (levels?.[0]?.[0]?.px && levels?.[0]?.[1]?.px) {
                        const bestBid = parseFloat(levels[0][0].px);
                        const bestAsk = parseFloat(levels[0][1].px);
                        const midPrice = (bestBid + bestAsk) / 2;
                        const ohlcv: OHLCV = {
                            timestamp: Date.now(),
                            open: midPrice,
                            high: midPrice,
                            low: midPrice,
                            close: midPrice,
                            volume: 0,
                            source: 'Hyperliquid',
                            symbol: this.coin,
                        };
                        this.emit('data', ohlcv);
                    }
                }
            } catch (err) {
                // Silently ignore parse errors
            }
        });

        this.ws.on('close', () => {
            console.log(`[Hyperliquid] Disconnected. Reconnecting in 5s...`);
            if (this.pingInterval) clearInterval(this.pingInterval);
            this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        });

        this.ws.on('error', (err) => {
            console.error(`[Hyperliquid] Error:`, err);
            this.ws?.close();
        });
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
        const MAX_PER_REQUEST = 5000;

        console.log(`[Hyperliquid] Fetching history ${interval} from ${new Date(startTime).toISOString()}`);

        while (currentStart < endTime) {
            try {
                const { data } = await axios.post(HL_API, {
                    type: 'candleSnapshot',
                    req: {
                        coin: this.coin,
                        interval,
                        startTime: currentStart,
                        endTime
                    }
                });

                if (!data || !Array.isArray(data) || data.length === 0) break;

                for (const k of data) {
                    allCandles.push({
                        timestamp: k.t,
                        open: parseFloat(k.o),
                        high: parseFloat(k.h),
                        low: parseFloat(k.l),
                        close: parseFloat(k.c),
                        volume: parseFloat(k.v),
                        source: 'Hyperliquid',
                        symbol: this.coin,
                    });
                }

                // Move forward
                currentStart = data[data.length - 1].t + 1;

                if (data.length < MAX_PER_REQUEST) break;
                await new Promise(r => setTimeout(r, 200));
            } catch (err: any) {
                console.error('[Hyperliquid] History fetch error:', err.message);
                break;
            }
        }

        allCandles.sort((a, b) => a.timestamp - b.timestamp);
        console.log(`[Hyperliquid] Fetched ${allCandles.length} candles`);
        return allCandles;
    }
}
