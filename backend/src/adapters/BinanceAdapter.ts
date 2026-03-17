import WebSocket from 'ws';
import axios from 'axios';
import { DataAdapter, OHLCV } from './DataAdapter';

const BINANCE_REST = 'https://api.binance.com';

export class BinanceAdapter extends DataAdapter {
    private ws: WebSocket | null = null;
    private reconnectTimer: NodeJS.Timeout | null = null;

    constructor(public symbol: string = 'btcusdt', public interval: string = '5m') {
        super('Binance');
    }

    get supportedIntervals(): string[] {
        return ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];
    }

    async connect(): Promise<void> {
        const url = `wss://stream.binance.com:9443/ws/${this.symbol}@kline_${this.interval}`;
        console.log(`[Binance] Connecting to ${url}`);

        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            console.log(`[Binance] Connected`);
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.e === 'kline') {
                    const k = msg.k;
                    const ohlcv: OHLCV = {
                        timestamp: k.t,
                        open: parseFloat(k.o),
                        high: parseFloat(k.h),
                        low: parseFloat(k.l),
                        close: parseFloat(k.c),
                        volume: parseFloat(k.v),
                        source: 'Binance',
                        symbol: this.symbol.toUpperCase(),
                    };
                    this.emit('data', ohlcv);
                }
            } catch (err) {
                console.error('[Binance] Error parsing message', err);
            }
        });

        this.ws.on('close', () => {
            console.log(`[Binance] Disconnected. Reconnecting in 5s...`);
            this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        });

        this.ws.on('error', (err) => {
            console.error(`[Binance] Error:`, err);
            this.ws?.close();
        });
    }

    async disconnect(): Promise<void> {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.ws?.removeAllListeners();
        this.ws?.close();
    }

    async fetchHistory(interval: string, startTime: number, endTime: number): Promise<OHLCV[]> {
        const allCandles: OHLCV[] = [];
        let currentStart = startTime;
        const limit = 1000;

        console.log(`[Binance] Fetching history ${interval} from ${new Date(startTime).toISOString()}`);

        while (currentStart < endTime) {
            try {
                const { data } = await axios.get(`${BINANCE_REST}/api/v3/klines`, {
                    params: {
                        symbol: this.symbol.toUpperCase(),
                        interval,
                        startTime: currentStart,
                        endTime,
                        limit
                    }
                });

                if (!data || data.length === 0) break;

                for (const k of data) {
                    allCandles.push({
                        timestamp: k[0],
                        open: parseFloat(k[1]),
                        high: parseFloat(k[2]),
                        low: parseFloat(k[3]),
                        close: parseFloat(k[4]),
                        volume: parseFloat(k[5]),
                        source: 'Binance',
                        symbol: this.symbol.toUpperCase(),
                    });
                }

                // Move start forward to after the last candle
                currentStart = data[data.length - 1][0] + 1;

                if (data.length < limit) break;

                // Rate limit: Binance allows 1200 req/min
                await new Promise(r => setTimeout(r, 100));
            } catch (err: any) {
                console.error('[Binance] History fetch error:', err.message);
                break;
            }
        }

        console.log(`[Binance] Fetched ${allCandles.length} candles`);
        return allCandles;
    }
}
