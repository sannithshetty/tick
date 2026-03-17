import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import { StreamAggregator } from './engine/StreamAggregator';
import cors from 'cors';

const app = express();
app.use(cors());

const port = 8040;
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const aggregator = new StreamAggregator();

aggregator.start();

app.get('/', (req, res) => {
    res.send('TradingView Backend is running with Data Streams');
});

// ----- REST API: Historical Candles -----

app.get('/api/history/:source', async (req, res) => {
    const { source } = req.params;
    const interval = (req.query.interval as string) || '1h';
    const endTime = parseInt(req.query.endTime as string) || Date.now();
    // Default: 1 year back
    const defaultStart = endTime - (365 * 24 * 60 * 60 * 1000);
    const startTime = parseInt(req.query.startTime as string) || defaultStart;

    const adapter = aggregator.getAdapter(source);
    if (!adapter) {
        res.status(404).json({ error: `Unknown source: ${source}` });
        return;
    }

    try {
        const candles = await adapter.fetchHistory(interval, startTime, endTime);
        res.json(candles);
    } catch (err: any) {
        console.error(`[API] History error for ${source}:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

// ----- REST API: Supported Intervals -----

app.get('/api/intervals/:source', (req, res) => {
    const { source } = req.params;
    const adapter = aggregator.getAdapter(source);
    if (!adapter) {
        res.status(404).json({ error: `Unknown source: ${source}` });
        return;
    }
    res.json({ source, intervals: adapter.supportedIntervals });
});

// ----- REST API: All Sources -----

app.get('/api/sources', (req, res) => {
    const sources = aggregator.getAllSources().map(name => {
        const adapter = aggregator.getAdapter(name)!;
        return {
            name,
            intervals: adapter.supportedIntervals,
        };
    });
    res.json(sources);
});

// ----- WebSocket: Broadcast real-time data -----

aggregator.on('data', (ohlcv) => {
    const msg = JSON.stringify({ type: 'price_update', data: ohlcv });
    wss.clients.forEach(client => {
        if (client.readyState === 1) { // OPEN
            client.send(msg);
        }
    });
});

wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.send(JSON.stringify({ type: 'welcome', message: 'Connected to Tick Streaming Service' }));
});

server.listen(port, () => {
    console.log(`Server started on http://localhost:${port}`);
});
