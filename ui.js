// UI update module
const ui = {
    updateMarketData(data) {
        const marketDataContainer = document.getElementById('market-data');
        marketDataContainer.innerHTML = ''; // Clear existing content

        // Create and append market data elements
        data.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.classList.add('market-item');
            itemElement.innerHTML = `
                <h3>${item.name}</h3>
                <p>Price: ${item.price}</p>
                <p>24h Change: ${item.change24h}%</p>
            `;
            marketDataContainer.appendChild(itemElement);
        });
    },

    updatePortfolioData(data) {
        const portfolioDataContainer = document.getElementById('portfolio-data');
        portfolioDataContainer.innerHTML = ''; // Clear existing content

        // Create and append portfolio data elements
        data.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.classList.add('portfolio-item');
            itemElement.innerHTML = `
                <h3>${item.name}</h3>
                <p>Balance: ${item.balance}</p>
                <p>Value: ${item.value}</p>
            `;
            portfolioDataContainer.appendChild(itemElement);
        });
    },

    populateCryptoPairs(selectElement, pairs) {
        pairs.forEach(pair => {
            const option = document.createElement('option');
            option.value = pair.id;
            option.textContent = pair.name;
            selectElement.appendChild(option);
        });
    },

    showSuccess(message) {
        this.showNotification(message, 'success');
    },

    showError(message) {
        this.showNotification(message, 'error');
    },

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.classList.add('notification', type);
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 5000);
    },
};
