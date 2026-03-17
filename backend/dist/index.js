"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const ws_1 = require("ws");
const http_1 = __importDefault(require("http"));
const StreamAggregator_1 = require("./engine/StreamAggregator");
const cors_1 = __importDefault(require("cors"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
const port = 3001;
const server = http_1.default.createServer(app);
const wss = new ws_1.WebSocketServer({ server });
const aggregator = new StreamAggregator_1.StreamAggregator();
aggregator.start();
app.get('/', (req, res) => {
    res.send('TradingView Backend is running with Data Streams');
});
// Broadcast aggregated data to all connected clients
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
