"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamAggregator = void 0;
const BinanceAdapter_1 = require("../adapters/BinanceAdapter");
const BybitAdapter_1 = require("../adapters/BybitAdapter");
const ChainlinkAdapter_1 = require("../adapters/ChainlinkAdapter");
const HyperliquidAdapter_1 = require("../adapters/HyperliquidAdapter");
const PolymarketAdapter_1 = require("../adapters/PolymarketAdapter");
const events_1 = __importDefault(require("events"));
class StreamAggregator extends events_1.default {
    constructor() {
        super();
        this.adapters = [];
        this.adapters.push(new BinanceAdapter_1.BinanceAdapter());
        this.adapters.push(new BybitAdapter_1.BybitAdapter());
        this.adapters.push(new ChainlinkAdapter_1.ChainlinkAdapter());
        this.adapters.push(new HyperliquidAdapter_1.HyperliquidAdapter());
        this.adapters.push(new PolymarketAdapter_1.PolymarketAdapter());
    }
    async start() {
        this.adapters.forEach(adapter => {
            adapter.on('data', (data) => {
                // Broadcast to main server
                this.emit('data', data);
            });
            adapter.connect().catch((err) => {
                console.error(`Failed to connect ${adapter.sourceName}:`, err);
            });
        });
    }
}
exports.StreamAggregator = StreamAggregator;
