let token = localStorage.getItem('token');
let isLoggedIn = !!token;
let accountBalance = 0;
let ws;
let chart;
let candleSeries;
let smaLine;

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    initializeChart();
    connectWebSocket();
});

function setupEventListeners() {
    document.getElementById('login-btn').addEventListener('click', login);
    document.getElementById('register-btn').addEventListener('click', register);
    document.getElementById('verify-2fa-btn').addEventListener('click', verify2FA);
    document.getElementById('setup-2fa-btn').addEventListener('click', setup2FA);
    document.getElementById('buy-btn').addEventListener('click', () => placeOrder('buy'));
    document.getElementById('sell-btn').addEventListener('click', () => placeOrder('sell'));
    document.getElementById('order-type').addEventListener('change', updateOrderForm);
    document.getElementById('close-auth-btn').addEventListener('click', () => {
        document.getElementById('auth-form').style.display = 'none';
    });
    
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        });
    });

    const sidebarItems = document.querySelectorAll('.sidebar-item');
    sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            sidebarItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        });
    });
}

function connectWebSocket() {
    ws = new WebSocket(`ws://${window.location.host}/api/ws`);

    ws.onopen = () => {
        console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        setTimeout(connectWebSocket, 5000);
    };
}

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'marketUpdate':
            updateMarketData(data);
            break;
        case 'orderBook':
            updateOrderBook(data.orderBook);
            break;
        case 'trade':
            updateTrade(data);
            break;
    }
}

function updateMarketData(data) {
    document.getElementById('last-price').textContent = `$${data.lastPrice}`;
    document.getElementById('24h-change').textContent = `${data.change24h}%`;
    document.getElementById('24h-high').textContent = `$${data.high}`;
    document.getElementById('24h-low').textContent = `$${data.low}`;
    document.getElementById('24h-volume').textContent = `${data.volume} BTC`;

    updateChart(data);
}

function updateOrderBook(orderBook) {
    const bidsElement = document.getElementById('bids');
    const asksElement = document.getElementById('asks');
    bidsElement.innerHTML = '';
    asksElement.innerHTML = '';

    const maxBidAmount = Math.max(...orderBook.bids.map(bid => bid.amount));
    const maxAskAmount = Math.max(...orderBook.asks.map(ask => ask.amount));

    orderBook.bids.forEach(bid => {
        const bidItem = document.createElement('div');
        bidItem.className = 'order-book-item';
        bidItem.innerHTML = `
            <span>${bid.price.toFixed(2)}</span>
            <span>${bid.amount.toFixed(8)}</span>
            <div class="order-book-item-fill" style="width: ${(bid.amount / maxBidAmount * 100)}%"></div>
        `;
        bidsElement.appendChild(bidItem);
    });

    orderBook.asks.forEach(ask => {
        const askItem = document.createElement('div');
        askItem.className = 'order-book-item';
        askItem.innerHTML = `
            <span>${ask.price.toFixed(2)}</span>
            <span>${ask.amount.toFixed(8)}</span>
            <div class="order-book-item-fill" style="width: ${(ask.amount / maxAskAmount * 100)}%"></div>
        `;
        asksElement.appendChild(askItem);
    });
}

function updateTrade(data) {
    console.log('Trade executed:', data);
    fetchUserInfo();
}

function initializeChart() {
    chart = LightweightCharts.createChart(document.getElementById('chart'), {
        width: 600,
        height: 300,
        layout: {
            background: { type: 'solid', color: '#1E1E1E' },
            textColor: '#d1d4dc',
        },
        grid: {
            vertLines: { color: '#2B2B43' },
            horzLines: { color: '#363C4E' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
            borderColor: '#485c7b',
        },
        timeScale: {
            borderColor: '#485c7b',
        },
    });

    candleSeries = chart.addCandlestickSeries({
        upColor: '#4bffb5',
        downColor: '#ff4976',
        borderDownColor: '#ff4976',
        borderUpColor: '#4bffb5',
        wickDownColor: '#838ca1',
        wickUpColor: '#838ca1',
    });

    smaLine = chart.addLineSeries({
        color: 'rgba(4, 111, 232, 1)',
        lineWidth: 2,
    });

    fetchHistoricalData();
}

function fetchHistoricalData() {
    fetch('/api/historical-data')
        .then(response => response.json())
        .then(data => {
            candleSeries.setData(data);
            
            const smaData = SMA.calculate({period : 14, values : data.map(d => d.close)});
            smaLine.setData(smaData.map((value, index) => ({
                time: data[index + 13].time,
                value: value
            })));
        })
        .catch(error => console.error('Error fetching historical data:', error));
}

function updateChart(data) {
    const lastCandle = candleSeries.lastValue();
    if (lastCandle) {
        if (data.time > lastCandle.time) {
            candleSeries.update({
                time: data.time,
                open: lastCandle.close,
                high: Math.max(lastCandle.close, data.lastPrice),
                low: Math.min(lastCandle.close, data.lastPrice),
                close: data.lastPrice
            });
        } else {
            candleSeries.update({
                time: lastCandle.time,
                high: Math.max(lastCandle.high, data.lastPrice),
                low: Math.min(lastCandle.low, data.lastPrice),
                close: data.lastPrice
            });
        }
    }

    document.getElementById('chart-open').textContent = `O: ${data.open.toFixed(2)}`;
    document.getElementById('chart-high').textContent = `H: ${data.high.toFixed(2)}`;
    document.getElementById('chart-low').textContent = `L: ${data.low.toFixed(2)}`;
    document.getElementById('chart-close').textContent = `C: ${data.close.toFixed(2)}`;
    document.getElementById('chart-change').textContent = `${(data.close - data.open).toFixed(2)} (${((data.close - data.open) / data.open * 100).toFixed(2)}%)`;
}

function login() {
    const usernameOrEmail = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(usernameOrEmail);
    const isBitmessage = /^BM-[a-zA-Z0-9]{32,34}$/.test(usernameOrEmail);

    if (!isEmail && !isBitmessage) {
        alert('Please enter a valid email address or bitmessage address.');
        return;
    }

    fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.message === '2FA required') {
            document.getElementById('auth-form').style.display = 'none';
            document.getElementById('two-factor-form').style.display = 'block';
            localStorage.setItem('tempUserId', data.user_id);
        } else if (data.token) {
            handleSuccessfulLogin(data.token);
        } else {
            alert('Login failed');
        }
    })
    .catch(error => console.error('Error:', error));
}

function verify2FA() {
    const userId = localStorage.getItem('tempUserId');
    const twoFactorToken = document.getElementById('two-factor-token').value;

    fetch('/api/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, token: twoFactorToken })
    })
    .then(response => response.json())
    .then(data => {
        if (data.token) {
            handleSuccessfulLogin(data.token);
        } else {
            alert('2FA verification failed');
        }
    })
    .catch(error => console.error('Error:', error));
}

function setup2FA() {
    fetch('/api/setup-2fa', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.secret && data.qr_code) {
            document.getElementById('qr-code').src = `data:image/png;base64,${data.qr_code}`;
            document.getElementById('secret-key').textContent = data.secret;
            document.getElementById('setup-2fa-form').style.display = 'block';
        } else {
            alert('Failed to set up 2FA');
        }
    })
    .catch(error => console.error('Error:', error));
}

function handleSuccessfulLogin(newToken) {
    token = newToken;
    localStorage.setItem('token', token);
    isLoggedIn = true;
    document.getElementById('auth-form').style.display = 'none';
    document.getElementById('two-factor-form').style.display = 'none';
    fetchUserInfo();
}

function register() {
    const usernameOrEmail = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(usernameOrEmail);
    const isBitmessage = /^BM-[a-zA-Z0-9]{32,34}$/.test(usernameOrEmail);

    if (!isEmail && !isBitmessage) {
        alert('Please enter a valid email address or bitmessage address.');
        return;
    }

    fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.message === 'Registered successfully') {
            alert('Registration successful. Please log in.');
        } else {
            alert('Registration failed: ' + data.message);
        }
    })
    .catch(error => console.error('Error:', error));
}

function fetchUserInfo() {
    fetch('/api/user', {
        headers: { 'Authorization': token }
    })
    .then(response => response.json())
    .then(data => {
        accountBalance = data.balance;
        updateAccountInfo();
    })
    .catch(error => console.error('Error:', error));
}

function updateAccountInfo() {
    document.getElementById('account-balance').textContent = `$${accountBalance.toFixed(2)}`;
}

function updateOrderForm() {
    const orderType = document.getElementById('order-type').value;
    document.getElementById('stop-price').style.display = 'none';
    document.getElementById('limit-price').style.display = 'none';
    document.getElementById('trailing-amount').style.display = 'none';

    switch (orderType) {
        case 'stop':
        case 'stop-limit':
            document.getElementById('stop-price').style.display = 'block';
            break;
        case 'trailing-stop':
            document.getElementById('trailing-amount').style.display = 'block';
            break;
    }

    if (orderType === 'stop-limit') {
        document.getElementById('limit-price').style.display = 'block';
    }
}

function placeOrder(side) {
    if (!isLoggedIn) {
        document.getElementById('auth-form').style.display = 'block';
        return;
    }

    const amount = parseFloat(document.getElementById('amount').value);
    const price = parseFloat(document.getElementById('price').value);
    const type = document.getElementById('order-type').value;

    if (!amount || (type !== 'market' && !price)) {
        alert('Please enter both amount and price (except for market orders).');
        return;
    }

    const orderData = { side, type, amount, price };
    
    if (type === 'stop' || type === 'stop-limit') {
        orderData.stop = parseFloat(document.getElementById('stop-price').value);
    }
    
    if (type === 'stop-limit') {
        orderData.limit = parseFloat(document.getElementById('limit-price').value);
    }
    
    if (type === 'trailing-stop') {
        orderData.trailingAmount = parseFloat(document.getElementById('trailing-amount').value);
    }

    fetch('/api/order', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token
        },
        body: JSON.stringify(orderData)
    })
    .then(response => response.json())
    .then(data => {
        alert(`Order placed: ${side} ${amount} BTC at $${price}`);
        fetchUserInfo();
    })
    .catch(error => {
        console.error('Error placing order:', error);
        alert('Error placing order. Please try again.');
    });
}

if (isLoggedIn) {
    fetchUserInfo();
} else {
    document.getElementById('auth-form').style.display = 'block';
}