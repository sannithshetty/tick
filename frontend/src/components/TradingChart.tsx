import React, { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, CandlestickData } from 'lightweight-charts';
import type { OHLCV } from '../types';

interface TradingChartProps {
    historyData: OHLCV[];
    lastUpdate: OHLCV | null;
    source: string;
    symbol: string;
}

export const TradingChart: React.FC<TradingChartProps> = ({
    historyData,
    lastUpdate,
    source,
    symbol
}) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const lastSetTimestamp = useRef<number>(0);

    // Create chart on mount
    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
            layout: {
                background: { color: '#12131a' },
                textColor: '#6b7280',
                fontSize: 10,
            },
            grid: {
                vertLines: { color: '#1a1c2e' },
                horzLines: { color: '#1a1c2e' },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#1e2030',
            },
            rightPriceScale: {
                borderColor: '#1e2030',
            },
            crosshair: {
                mode: 0,
                vertLine: {
                    color: '#6366f1',
                    width: 1,
                    style: 2,
                    labelBackgroundColor: '#6366f1',
                },
                horzLine: {
                    color: '#6366f1',
                    width: 1,
                    style: 2,
                    labelBackgroundColor: '#6366f1',
                },
            },
        });

        const series = chart.addSeries(CandlestickSeries, {
            upColor: '#22c55e',
            downColor: '#ef4444',
            borderVisible: false,
            wickUpColor: '#22c55e',
            wickDownColor: '#ef4444',
        });

        chartRef.current = chart;
        seriesRef.current = series;

        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                chartRef.current.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                    height: chartContainerRef.current.clientHeight
                });
            }
        };

        const observer = new ResizeObserver(handleResize);
        observer.observe(chartContainerRef.current);

        return () => {
            observer.disconnect();
            chart.remove();
        };
    }, []);

    // Set historical data
    useEffect(() => {
        if (!seriesRef.current || historyData.length === 0) return;

        const chartData: CandlestickData[] = historyData
            .map(d => ({
                time: Math.floor(d.timestamp / 1000) as any,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
            }))
            .sort((a, b) => (a.time as number) - (b.time as number));

        // Deduplicate by time (prefer last occurrence)
        const uniqueData = new Map<number, CandlestickData>();
        chartData.forEach(item => uniqueData.set(item.time as number, item));
        const sortedUniqueData = Array.from(uniqueData.values())
            .sort((a, b) => (a.time as number) - (b.time as number));

        seriesRef.current.setData(sortedUniqueData);
        lastSetTimestamp.current = sortedUniqueData.length > 0
            ? (sortedUniqueData[sortedUniqueData.length - 1].time as number)
            : 0;

        // Fit content
        chartRef.current?.timeScale().fitContent();
    }, [historyData]);

    // Update with real-time data
    useEffect(() => {
        if (!seriesRef.current || !lastUpdate) return;
        if (lastUpdate.source !== source) return;

        const timeSeconds = Math.floor(lastUpdate.timestamp / 1000);

        const candleData: CandlestickData = {
            time: timeSeconds as any,
            open: lastUpdate.open,
            high: lastUpdate.high,
            low: lastUpdate.low,
            close: lastUpdate.close,
        };

        try {
            seriesRef.current.update(candleData);
        } catch {
            // If update fails (e.g. time out of order), silently ignore
        }
    }, [lastUpdate, source]);

    return <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />;
};
