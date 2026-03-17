"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HyperliquidAdapter = void 0;
const ws_1 = __importDefault(require("ws"));
const DataAdapter_1 = require("./DataAdapter");
class HyperliquidAdapter extends DataAdapter_1.DataAdapter {
    constructor(coin = 'BTC') {
        super('Hyperliquid');
        this.coin = coin;
        this.ws = null;
        this.reconnectTimer = null;
        this.pingInterval = null;
    }
    async connect() {
        const url = 'wss://api.hyperliquid.xyz/ws';
        console.log(`[Hyperliquid] Connecting to ${url}`);
        this.ws = new ws_1.default(url);
        this.ws.on('open', () => {
            console.log(`[Hyperliquid] Connected`);
            // Subscribe to L2 Book for price updates (using mid price) or trades
            const subscribeMsg = {
                method: 'subscribe',
                subscription: { type: 'l2Book', coin: this.coin }
            };
            this.ws?.send(JSON.stringify(subscribeMsg));
            // Heartbeat
            this.pingInterval = setInterval(() => {
                if (this.ws?.readyState === ws_1.default.OPEN) {
                    this.ws.send(JSON.stringify({ method: 'ping' }));
                }
            }, 50000);
        });
        this.ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.channel === 'l2Book' && msg.data) {
                    const { levels } = msg.data;
                    // Calculate mid price from best bid and ask
                    const bestBid = parseFloat(levels[0][0].px);
                    const bestAsk = parseFloat(levels[0][1].px);
                    if (bestBid && bestAsk) {
                        const midPrice = (bestBid + bestAsk) / 2;
                        const ohlcv = {
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
            }
            catch (err) {
                // console.error('[Hyperliquid] Error parsing message', err);
            }
        });
        this.ws.on('close', () => {
            console.log(`[Hyperliquid] Disconnected. Reconnecting in 5s...`);
            if (this.pingInterval)
                clearInterval(this.pingInterval);
            this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        });
        this.ws.on('error', (err) => {
            console.error(`[Hyperliquid] Error:`, err);
            this.ws?.close();
        });
    }
    async disconnect() {
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        if (this.pingInterval)
            clearInterval(this.pingInterval);
        this.ws?.removeAllListeners();
        this.ws?.close();
    }
}
exports.HyperliquidAdapter = HyperliquidAdapter;
