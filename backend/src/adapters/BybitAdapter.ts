import WebSocket from 'ws';
import axios from 'axios';
import { DataAdapter, OHLCV } from './DataAdapter';

const BYBIT_REST = 'https://api.bybit.com';

export class BybitAdapter extends DataAdapter {
    private ws: WebSocket | null = null;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private pingInterval: NodeJS.Timeout | null = null;

    constructor(public symbol: string = 'BTCUSDT', public topic: string = 'kline.5') {
        super('Bybit');
    }

    get supportedIntervals(): string[] {
        return ['1', '3', '5', '15', '30', '60', '120', '240', '360', '720', 'D', 'W', 'M'];
    }

    async connect(): Promise<void> {
        const url = 'wss://stream.bybit.com/v5/public/linear';
        console.log(`[Bybit] Connecting to ${url}`);

        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            console.log(`[Bybit] Connected`);
            const subscribeMsg = {
                op: 'subscribe',
                args: [`${this.topic}.${this.symbol}`]
            };
            this.ws?.send(JSON.stringify(subscribeMsg));

            this.pingInterval = setInterval(() => {
                if (this.ws?.readyState === WebSocket.OPEN) {
                    this.ws.send(JSON.stringify({ op: 'ping' }));
                }
            }, 20000);
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.topic && msg.topic.startsWith('kline') && msg.data) {
                    msg.data.forEach((k: any) => {
                        const ohlcv: OHLCV = {
                            timestamp: k.start,
                            open: parseFloat(k.open),
                            high: parseFloat(k.high),
                            low: parseFloat(k.low),
                            close: parseFloat(k.close),
                            volume: parseFloat(k.volume),
                            source: 'Bybit',
                            symbol: this.symbol,
                        };
                        this.emit('data', ohlcv);
                    });
                }
            } catch (err) {
                console.error('[Bybit] Error parsing message', err);
            }
        });

        this.ws.on('close', () => {
            console.log(`[Bybit] Disconnected. Reconnecting in 5s...`);
            if (this.pingInterval) clearInterval(this.pingInterval);
            this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        });

        this.ws.on('error', (err) => {
            console.error(`[Bybit] Error:`, err);
            this.ws?.close();
        });
    }

    async disconnect(): Promise<void> {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.ws?.removeAllListeners();
        this.ws?.close();
    }

    /** Map user-friendly interval strings to Bybit API format */
    private toBybitInterval(interval: string): string {
        const map: Record<string, string> = {
            '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
            '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
            '1d': 'D', '1w': 'W', '1M': 'M'
        };
        return map[interval] || interval;
    }

    async fetchHistory(interval: string, startTime: number, endTime: number): Promise<OHLCV[]> {
        const allCandles: OHLCV[] = [];
        const bybitInterval = this.toBybitInterval(interval);
        let currentEnd = endTime;
        const limit = 1000;

        console.log(`[Bybit] Fetching history ${interval} from ${new Date(startTime).toISOString()}`);

        while (currentEnd > startTime) {
            try {
                const { data } = await axios.get(`${BYBIT_REST}/v5/market/kline`, {
                    params: {
                        category: 'linear',
                        symbol: this.symbol,
                        interval: bybitInterval,
                        start: startTime,
                        end: currentEnd,
                        limit
                    }
                });

                if (!data?.result?.list || data.result.list.length === 0) break;

                const list = data.result.list;
                for (const k of list) {
                    allCandles.push({
                        timestamp: parseInt(k[0]),
                        open: parseFloat(k[1]),
                        high: parseFloat(k[2]),
                        low: parseFloat(k[3]),
                        close: parseFloat(k[4]),
                        volume: parseFloat(k[5]),
                        source: 'Bybit',
                        symbol: this.symbol,
                    });
                }

                // Bybit returns newest first; move endTime backwards
                const earliest = parseInt(list[list.length - 1][0]);
                currentEnd = earliest - 1;

                if (list.length < limit) break;
                await new Promise(r => setTimeout(r, 100));
            } catch (err: any) {
                console.error('[Bybit] History fetch error:', err.message);
                break;
            }
        }

        // Sort oldest first
        allCandles.sort((a, b) => a.timestamp - b.timestamp);
        console.log(`[Bybit] Fetched ${allCandles.length} candles`);
        return allCandles;
    }
}
