import { DataAdapter, OHLCV } from '../adapters/DataAdapter';
import { BinanceAdapter } from '../adapters/BinanceAdapter';
import { BybitAdapter } from '../adapters/BybitAdapter';
import { ChainlinkAdapter } from '../adapters/ChainlinkAdapter';
import { HyperliquidAdapter } from '../adapters/HyperliquidAdapter';
import { HibachiAdapter } from '../adapters/HibachiAdapter';
import { OstiumAdapter } from '../adapters/OstiumAdapter';
import EventEmitter from 'events';

export class StreamAggregator extends EventEmitter {
    private adapters: Map<string, DataAdapter> = new Map();

    constructor() {
        super();
        const binance = new BinanceAdapter();
        const bybit = new BybitAdapter();
        const chainlink = new ChainlinkAdapter();
        const hyperliquid = new HyperliquidAdapter();
        const hibachi = new HibachiAdapter();
        const ostium = new OstiumAdapter();

        this.adapters.set('Binance', binance);
        this.adapters.set('Bybit', bybit);
        this.adapters.set('Chainlink', chainlink);
        this.adapters.set('Hyperliquid', hyperliquid);
        this.adapters.set('Hibachi', hibachi);
        this.adapters.set('Ostium', ostium);
    }

    getAdapter(sourceName: string): DataAdapter | undefined {
        return this.adapters.get(sourceName);
    }

    getAllSources(): string[] {
        return Array.from(this.adapters.keys());
    }

    async start() {
        this.adapters.forEach((adapter, name) => {
            adapter.on('data', (data: OHLCV) => {
                this.emit('data', data);
            });

            adapter.connect().catch((err: unknown) => {
                console.error(`Failed to connect ${name}:`, err);
            });
        });
    }
}
