import EventEmitter from 'events';

export interface OHLCV {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    source: string;
    symbol: string;
}

export abstract class DataAdapter extends EventEmitter {
    constructor(public sourceName: string) {
        super();
    }

    abstract connect(): Promise<void>;
    abstract disconnect(): Promise<void>;

    /** Supported candle intervals for this adapter */
    abstract get supportedIntervals(): string[];

    /** Fetch historical candles. Override in subclasses that support it. */
    async fetchHistory(
        _interval: string,
        _startTime: number,
        _endTime: number
    ): Promise<OHLCV[]> {
        return [];
    }
}
