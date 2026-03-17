"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BybitAdapter = void 0;
const ws_1 = __importDefault(require("ws"));
const DataAdapter_1 = require("./DataAdapter");
class BybitAdapter extends DataAdapter_1.DataAdapter {
    constructor(symbol = 'BTCUSDT', topic = 'kline.5') {
        super('Bybit');
        this.symbol = symbol;
        this.topic = topic;
        this.ws = null;
        this.reconnectTimer = null;
        this.pingInterval = null;
    }
    async connect() {
        const url = 'wss://stream.bybit.com/v5/public/linear';
        console.log(`[Bybit] Connecting to ${url}`);
        this.ws = new ws_1.default(url);
        this.ws.on('open', () => {
            console.log(`[Bybit] Connected`);
            // Subscribe
            const subscribeMsg = {
                op: 'subscribe',
                args: [`${this.topic}.${this.symbol}`]
            };
            this.ws?.send(JSON.stringify(subscribeMsg));
            // Heartbeat
            this.pingInterval = setInterval(() => {
                if (this.ws?.readyState === ws_1.default.OPEN) {
                    this.ws.send(JSON.stringify({ op: 'ping' }));
                }
            }, 20000);
        });
        this.ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.topic && msg.topic.startsWith('kline') && msg.data) {
                    msg.data.forEach((k) => {
                        const ohlcv = {
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
            }
            catch (err) {
                console.error('[Bybit] Error parsing message', err);
            }
        });
        this.ws.on('close', () => {
            console.log(`[Bybit] Disconnected. Reconnecting in 5s...`);
            if (this.pingInterval)
                clearInterval(this.pingInterval);
            this.reconnectTimer = setTimeout(() => this.connect(), 5000);
        });
        this.ws.on('error', (err) => {
            console.error(`[Bybit] Error:`, err);
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
exports.BybitAdapter = BybitAdapter;
