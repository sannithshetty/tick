import { ethers } from 'ethers';
import axios from 'axios';
import { DataAdapter, OHLCV } from './DataAdapter';

// BTC/USD Aggregator on Ethereum Mainnet
const AGGREGATOR_ADDR = '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c';
const ABI = [
    'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
    'function decimals() view returns (uint8)'
];

export class ChainlinkAdapter extends DataAdapter {
    private provider: ethers.JsonRpcProvider;
    private contract: ethers.Contract;
    private timer: NodeJS.Timeout | null = null;

    constructor(rpcUrl: string = 'https://1rpc.io/eth') {
        super('Chainlink');
        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.contract = new ethers.Contract(AGGREGATOR_ADDR, ABI, this.provider);
    }

    get supportedIntervals(): string[] {
        return ['1h', '4h', '1d'];
    }

    async connect(): Promise<void> {
        console.log('[Chainlink] Starting on-chain oracle polling...');
        this.poll();
        this.timer = setInterval(() => this.poll(), 15000);
    }

    async poll() {
        try {
            const [, answer, , updatedAt] = await this.contract.latestRoundData();
            const decimals = await this.contract.decimals();
            const price = Number(ethers.formatUnits(answer, decimals));

            const ohlcv: OHLCV = {
                timestamp: Number(updatedAt) * 1000,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: 0,
                source: 'Chainlink',
                symbol: 'BTCUSD'
            };

            this.emit('data', ohlcv);
        } catch (err: any) {
            if (err.code === 'CALL_EXCEPTION' || err.code === 'BAD_DATA') {
                console.warn('[Chainlink] RPC call failed (retrying silently)');
            } else {
                console.error('[Chainlink] Error:', err.message);
            }
        }
    }

    async disconnect(): Promise<void> {
        if (this.timer) clearInterval(this.timer);
    }

    /**
     * Fetch historical BTC/USD candles.
     * Since on-chain RPC is too slow for 1yr backfill (and CoinGecko/CoinCap have issues),
     * we proxy to the reliable Binance API for BTC/USDT which tracks the oracle ~1:1.
     */
    async fetchHistory(interval: string, startTime: number, endTime: number): Promise<OHLCV[]> {
        console.log(`[Chainlink] Fetching BTC/USD history via Binance Proxy (${interval})...`);

        const allCandles: OHLCV[] = [];
        const symbol = 'BTCUSDT'; // Proxy symbol

        let currentStart = startTime;
        const limit = 1000; // Binance max limit per request

        try {
            while (currentStart < endTime) {
                const { data } = await axios.get('https://api.binance.com/api/v3/klines', {
                    params: {
                        symbol,
                        interval, // '1h', '4h', '1d' map perfectly to Binance
                        startTime: currentStart,
                        endTime,
                        limit
                    },
                    timeout: 10000
                });

                if (!Array.isArray(data) || data.length === 0) {
                    break;
                }

                for (const row of data) {
                    allCandles.push({
                        timestamp: row[0],
                        open: parseFloat(row[1]),
                        high: parseFloat(row[2]),
                        low: parseFloat(row[3]),
                        close: parseFloat(row[4]),
                        volume: parseFloat(row[5]),
                        source: 'Chainlink', // Label as our source
                        symbol: 'BTCUSD'
                    });
                }

                currentStart = data[data.length - 1][0] + 1;

                // Small delay to respect rate limits
                await new Promise(r => setTimeout(r, 100));

                // If we received fewer than the limit, we've hit the end
                if (data.length < limit) break;
            }

            console.log(`[Chainlink] Fetched ${allCandles.length} candles via Binance Proxy`);
        } catch (err: any) {
            console.error('[Chainlink] History fetch error:', err.message);
        }

        allCandles.sort((a, b) => a.timestamp - b.timestamp);
        return allCandles;
    }
}
