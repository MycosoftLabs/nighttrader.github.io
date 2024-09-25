// API communication module
const api = {
    baseUrl: '/api', // Updated to use relative path

    async getMarketData() {
        const response = await fetch(`${this.baseUrl}/market`);
        if (!response.ok) {
            throw new Error('Failed to fetch market data');
        }
        return response.json();
    },

    async getPortfolioData() {
        const response = await fetch(`${this.baseUrl}/portfolio`);
        if (!response.ok) {
            throw new Error('Failed to fetch portfolio data');
        }
        return response.json();
    },

    async getCryptoPairs() {
        const response = await fetch(`${this.baseUrl}/crypto-pairs`);
        if (!response.ok) {
            throw new Error('Failed to fetch crypto pairs');
        }
        return response.json();
    },

    async executeTrade(tradeData) {
        // For the initial prototype, we'll just log the trade data
        console.log('Executing trade:', tradeData);
        return { success: true, message: 'Trade executed successfully' };
    },
};
