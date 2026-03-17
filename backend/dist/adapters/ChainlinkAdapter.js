"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChainlinkAdapter = void 0;
const ethers_1 = require("ethers");
const DataAdapter_1 = require("./DataAdapter");
// BTC/USD Aggregator on Ethereum Mainnet
const AGGREGATOR_ADDR = '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c';
const ABI = [
    'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
    'function decimals() view returns (uint8)'
];
class ChainlinkAdapter extends DataAdapter_1.DataAdapter {
    constructor(rpcUrl = 'https://rpc.ankr.com/eth') {
        super('Chainlink');
        this.timer = null;
        this.provider = new ethers_1.ethers.JsonRpcProvider(rpcUrl);
        this.contract = new ethers_1.ethers.Contract(AGGREGATOR_ADDR, ABI, this.provider);
    }
    async connect() {
        console.log('[Chainlink] Starting polling...');
        this.poll();
        this.timer = setInterval(() => this.poll(), 15000); // Poll every 15s (approx block time)
    }
    async poll() {
        try {
            const [roundId, answer, startedAt, updatedAt, answeredInRound] = await this.contract.latestRoundData();
            const decimals = await this.contract.decimals();
            const price = Number(ethers_1.ethers.formatUnits(answer, decimals));
            const ohlcv = {
                timestamp: Number(updatedAt) * 1000,
                open: price, // Chainlink only provides one price, treating as close
                high: price,
                low: price,
                close: price,
                volume: 0,
                source: 'Chainlink',
                symbol: 'BTCUSD'
            };
            this.emit('data', ohlcv);
        }
        catch (err) {
            console.error('[Chainlink] Error fetching data:', err);
        }
    }
    async disconnect() {
        if (this.timer)
            clearInterval(this.timer);
    }
}
exports.ChainlinkAdapter = ChainlinkAdapter;
