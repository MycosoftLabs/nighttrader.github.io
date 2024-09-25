// Main application logic
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the application
    initializeApp();
});

function initializeApp() {
    // Load market data
    loadMarketData();

    // Load portfolio data
    loadPortfolioData();

    // Initialize trade form
    initializeTradeForm();

    // Set up real-time data updates
    setupRealTimeUpdates();
}

function loadMarketData() {
    api.getMarketData()
        .then(data => {
            ui.updateMarketData(data);
        })
        .catch(error => {
            console.error('Error loading market data:', error);
            ui.showError('Failed to load market data. Please try again later.');
        });
}

function loadPortfolioData() {
    api.getPortfolioData()
        .then(data => {
            ui.updatePortfolioData(data);
        })
        .catch(error => {
            console.error('Error loading portfolio data:', error);
            ui.showError('Failed to load portfolio data. Please try again later.');
        });
}

function initializeTradeForm() {
    const tradeForm = document.getElementById('trade-form');
    const cryptoPairSelect = document.getElementById('crypto-pair');

    // Populate crypto pair options
    api.getCryptoPairs()
        .then(pairs => {
            ui.populateCryptoPairs(cryptoPairSelect, pairs);
        })
        .catch(error => {
            console.error('Error loading crypto pairs:', error);
            ui.showError('Failed to load crypto pairs. Please try again later.');
        });

    tradeForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const formData = new FormData(tradeForm);
        const tradeData = {
            cryptoPair: formData.get('crypto-pair'),
            amount: parseFloat(formData.get('amount')),
            tradeType: formData.get('trade-type')
        };

        executeTrade(tradeData);
    });
}

function executeTrade(tradeData) {
    api.executeTrade(tradeData)
        .then(result => {
            ui.showSuccess('Trade executed successfully!');
            loadPortfolioData(); // Refresh portfolio data after trade
        })
        .catch(error => {
            console.error('Error executing trade:', error);
            ui.showError('Failed to execute trade. Please try again.');
        });
}

function setupRealTimeUpdates() {
    // Set up WebSocket connection or use periodic AJAX requests
    // for real-time updates of market data and portfolio
    setInterval(() => {
        loadMarketData();
        loadPortfolioData();
    }, 30000); // Update every 30 seconds
}
