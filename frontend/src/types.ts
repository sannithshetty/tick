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

export type ChartData = {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}[];
