"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceAdapter = void 0;
const ws_1 = __importDefault(require("ws"));
const DataAdapter_1 = require("./DataAdapter");
class BinanceAdapter extends DataAdapter_1.DataAdapter {
    constructor(symbol = 'btcusdt', interval = '5m') {
        super('Binance');
        this.symbol = symbol;
        this.interval = interval;
        this.ws = null;
        this.reconnectTimer = null;
    }
    async connect() {
        const url = `wss://stream.binance.com:9443/ws/${this.symbol}@kline_${this.interval}`;
        console.log(`[Binance] Connecting to ${url}`);
        this.ws = new ws_1.default(url);
        this.ws.on('open', () => {
            console.log(`[Binance] Connected`);
        });
        this.ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.e === 'kline') {
                    const k = msg.k;
                    const ohlcv = {
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
            }
            catch (err) {
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
    async disconnect() {
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        this.ws?.removeAllListeners();
        this.ws?.close();
    }
}
exports.BinanceAdapter = BinanceAdapter;
