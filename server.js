// server.js
const express = require('express');
const https = require('https');
const fs = require('fs');
const WebSocket = require('ws');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = https.createServer({
  key: fs.readFileSync('path/to/private-key.pem'),
  cert: fs.readFileSync('path/to/certificate.pem')
}, app);
const wss = new WebSocket.Server({ server });

app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// Database connection
const pool = new Pool({
  user: 'your_username',
  host: 'localhost',
  database: 'trading_platform',
  password: 'your_password',
  port: 5432,
});

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'trading-platform' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

// JWT secret key (use a strong, unique key in production)
const JWT_SECRET = 'your-secret-key';

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(403).json({ error: 'No token provided' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(500).json({ error: 'Failed to authenticate token' });
    req.userId = decoded.id;
    next();
  });
};

// User registration
app.post('/register', [
  body('username').isLength({ min: 5 }),
  body('password').isLength({ min: 8 }),
  body('email').isEmail(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, password, email } = req.body;

  try {
    const userExists = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await pool.query(
      'INSERT INTO users (username, password, email, balance) VALUES ($1, $2, $3, $4) RETURNING id',
      [username, hashedPassword, email, 10000]
    );

    const token = jwt.sign({ id: newUser.rows[0].id }, JWT_SECRET, { expiresIn: 86400 });

    res.status(201).json({ auth: true, token });
  } catch (error) {
    logger.error('Error in user registration:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const passwordIsValid = await bcrypt.compare(password, user.rows[0].password);
    if (!passwordIsValid) {
      return res.status(401).json({ auth: false, token: null });
    }

    if (user.rows[0].two_factor_secret) {
      return res.status(200).json({ requireTwoFactor: true, userId: user.rows[0].id });
    }

    const token = jwt.sign({ id: user.rows[0].id }, JWT_SECRET, { expiresIn: 86400 });
    res.status(200).json({ auth: true, token });
  } catch (error) {
    logger.error('Error in user login:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Two-factor authentication setup
app.post('/setup-2fa', verifyToken, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({ name: 'TradingPlatform' });
    await pool.query('UPDATE users SET two_factor_secret = $1 WHERE id = $2', [secret.base32, req.userId]);
    
    QRCode.toDataURL(secret.otpauth_url, (err, dataUrl) => {
      if (err) {
        logger.error('Error generating QR code:', err);
        return res.status(500).json({ error: 'Error generating QR code' });
      }
      res.json({ secret: secret.base32, qrCode: dataUrl });
    });
  } catch (error) {
    logger.error('Error setting up 2FA:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify two-factor authentication
app.post('/verify-2fa', async (req, res) => {
  const { userId, token } = req.body;

  try {
    const user = await pool.query('SELECT two_factor_secret FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.rows[0].two_factor_secret,
      encoding: 'base32',
      token: token
    });

    if (verified) {
      const jwtToken = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: 86400 });
      res.json({ auth: true, token: jwtToken });
    } else {
      res.status(400).json({ error: 'Invalid 2FA token' });
    }
  } catch (error) {
    logger.error('Error verifying 2FA:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout
app.post('/logout', (req, res) => {
  // In a stateless JWT system, we don't need to do anything server-side
  // The client should remove the token
  res.status(200).json({ auth: false, token: null });
});

// Get user info
app.get('/user', verifyToken, async (req, res) => {
  try {
    const user = await pool.query('SELECT id, username, email, balance FROM users WHERE id = $1', [req.userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user.rows[0]);
  } catch (error) {
    logger.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Place order
app.post('/order', verifyToken, [
  body('type').isIn(['market', 'limit', 'stop', 'stop-limit', 'trailing-stop']),
  body('side').isIn(['buy', 'sell']),
  body('amount').isFloat({ min: 0.00000001 }),
  body('price').optional().isFloat({ min: 0 }),
  body('stop').optional().isFloat({ min: 0 }),
  body('limit').optional().isFloat({ min: 0 }),
  body('trailingAmount').optional().isFloat({ min: 0 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { type, side, amount, price, stop, limit, trailingAmount } = req.body;

  try {
    const user = await pool.query('SELECT balance FROM users WHERE id = $1', [req.userId]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Implement order logic here (check balance, create order, update user balance)
    const orderId = uuidv4();
    await pool.query(
      'INSERT INTO orders (id, user_id, type, side, amount, price, stop, limit, trailing_amount, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [orderId, req.userId, type, side, amount, price, stop, limit, trailingAmount, 'open']
    );

    // Broadcast the new order to all connected clients
    const order = { id: orderId, userId: req.userId, type, side, amount, price, stop, limit, trailingAmount, status: 'open' };
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'newOrder', order }));
      }
    });

    res.json(order);

    // Trigger the matching engine
    matchOrders();
  } catch (error) {
    logger.error('Error placing order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Matching engine
async function matchOrders() {
  try {
    const buyOrders = await pool.query('SELECT * FROM orders WHERE side = $1 AND status = $2 ORDER BY price DESC, created_at ASC', ['buy', 'open']);
    const sellOrders = await pool.query('SELECT * FROM orders WHERE side = $1 AND status = $2 ORDER BY price ASC, created_at ASC', ['sell', 'open']);

    for (const buyOrder of buyOrders.rows) {
      for (const sellOrder of sellOrders.rows) {
        if (buyOrder.price >= sellOrder.price) {
          const matchedAmount = Math.min(buyOrder.amount, sellOrder.amount);
          const matchPrice = sellOrder.price;

          // Update orders
          await pool.query('UPDATE orders SET amount = amount - $1, status = CASE WHEN amount - $1 <= 0 THEN $2 ELSE $3 END WHERE id = $4', [matchedAmount, 'filled', 'partial', buyOrder.id]);
          await pool.query('UPDATE orders SET amount = amount - $1, status = CASE WHEN amount - $1 <= 0 THEN $2 ELSE $3 END WHERE id = $4', [matchedAmount, 'filled', 'partial', sellOrder.id]);

          // Update user balances
          await pool.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [matchedAmount * matchPrice, buyOrder.user_id]);
          await pool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [matchedAmount * matchPrice, sellOrder.user_id]);

          // Create trade record
          await pool.query('INSERT INTO trades (buy_order_id, sell_order_id, amount, price) VALUES ($1, $2, $3, $4)', [buyOrder.id, sellOrder.id, matchedAmount, matchPrice]);

          // Notify users
          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'trade', buyOrderId: buyOrder.id, sellOrderId: sellOrder.id, amount: matchedAmount, price: matchPrice }));
            }
          });

          if (buyOrder.amount - matchedAmount <= 0) break;
        }
      }
    }
  } catch (error) {
    logger.error('Error in matching engine:', error);
  }
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  // Send initial data
  pool.query('SELECT * FROM orders WHERE status = $1', ['open'])
    .then(result => {
      ws.send(JSON.stringify({ type: 'initialData', orders: result.rows }));
    })
    .catch(error => {
      logger.error('Error fetching initial data:', error);
    });

  // Handle incoming messages
  ws.on('message', (message) => {
    console.log('Received:', message);
    // Handle different types of messages (e.g., subscribe to specific data)
  });
});

// Simulated market data updates
setInterval(() => {
  const marketUpdate = {
    type: 'marketUpdate',
    price: 30000 + Math.random() * 1000,
    volume: Math.random() * 100
  };

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(marketUpdate));
    }
  });
}, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));