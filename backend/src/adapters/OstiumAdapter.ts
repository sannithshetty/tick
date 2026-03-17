import axios from 'axios';
import { DataAdapter, OHLCV } from './DataAdapter';

const OSTIUM_PRICES_URL = 'https://metadata-backend.ostium.io/PricePublish/latest-prices';

interface CandleAccumulator {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export class OstiumAdapter extends DataAdapter {
    private timer: NodeJS.Timeout | null = null;
    private candleStore: Map<string, OHLCV[]> = new Map(); // key = interval
    private currentCandle: Map<string, CandleAccumulator> = new Map();
    public asset: string = 'BTCUSD';

    constructor(asset: string = 'BTCUSD') {
        super('Ostium');
        this.asset = asset;
    }

    get supportedIntervals(): string[] {
        return ['1m', '5m', '15m', '1h'];
    }

    private intervalMs(interval: string): number {
        const map: Record<string, number> = {
            '1m': 60000, '5m': 300000, '15m': 900000, '1h': 3600000,
        };
        return map[interval] || 60000;
    }

    async connect(): Promise<void> {
        console.log(`[Ostium] Starting price polling for ${this.asset}...`);
        // Poll every 2 seconds
        this.poll();
        this.timer = setInterval(() => this.poll(), 2000);
    }

    async poll() {
        try {
            const { data } = await axios.get(OSTIUM_PRICES_URL, { timeout: 5000 });

            // data is an array of { asset, price, timestamp } or similar
            let price: number | null = null;
            let ts = Date.now();

            if (Array.isArray(data)) {
                const entry = data.find((d: any) =>
                    (d.asset || d.ticker || d.symbol || '').toUpperCase().includes(this.asset.toUpperCase().replace('USD', ''))
                );
                if (entry) {
                    price = parseFloat(entry.price || entry.value || entry.mid || '0');
                    ts = entry.timestamp ? (entry.timestamp < 1e12 ? entry.timestamp * 1000 : entry.timestamp) : Date.now();
                }
            } else if (typeof data === 'object' && data !== null) {
                // Could be { BTCUSD: { price: ... } } or { price: ... }
                const entry = data[this.asset] || data;
                if (entry?.price !== undefined) {
                    price = parseFloat(entry.price);
                }
            }

            if (price && price > 0) {
                // Emit a tick-level OHLCV (O=H=L=C=price)
                const ohlcv: OHLCV = {
                    timestamp: ts,
                    open: price,
                    high: price,
                    low: price,
                    close: price,
                    volume: 0,
                    source: 'Ostium',
                    symbol: this.asset,
                };
                this.emit('data', ohlcv);

                // Aggregate into candles for each interval
                for (const interval of this.supportedIntervals) {
                    this.aggregateTick(interval, price, ts);
                }
            }
        } catch (err: any) {
            // Silence transient errors
            if (err.code !== 'ECONNABORTED') {
                console.error('[Ostium] Poll error:', err.message);
            }
        }
    }

    private aggregateTick(interval: string, price: number, ts: number) {
        const ms = this.intervalMs(interval);
        const candleTime = Math.floor(ts / ms) * ms;
        const key = `${interval}`;

        let candle = this.currentCandle.get(key);

        if (!candle || candle.timestamp !== candleTime) {
            // Save completed candle
            if (candle) {
                const completedOhlcv: OHLCV = {
                    timestamp: candle.timestamp,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close,
                    volume: candle.volume,
                    source: 'Ostium',
                    symbol: this.asset,
                };
                if (!this.candleStore.has(key)) this.candleStore.set(key, []);
                this.candleStore.get(key)!.push(completedOhlcv);
            }

            // Start new candle
            candle = {
                timestamp: candleTime,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: 0,
            };
            this.currentCandle.set(key, candle);
        } else {
            // Update existing candle
            candle.high = Math.max(candle.high, price);
            candle.low = Math.min(candle.low, price);
            candle.close = price;
        }
    }

    async disconnect(): Promise<void> {
        if (this.timer) clearInterval(this.timer);
    }

    async fetchHistory(interval: string, _startTime: number, _endTime: number): Promise<OHLCV[]> {
        // Return accumulated candles from memory
        const candles = this.candleStore.get(interval) || [];
        console.log(`[Ostium] Returning ${candles.length} accumulated ${interval} candles from memory`);
        return candles;
    }
}
