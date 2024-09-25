from flask import Flask, jsonify, send_from_directory, request
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO, emit
import os
from datetime import datetime, timedelta
import jwt
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import random
import re
import pyotp
import qrcode
import base64
from io import BytesIO

app = Flask(__name__, static_folder='.')
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your_secret_key')
db = SQLAlchemy(app)
socketio = SocketIO(app, cors_allowed_origins="*")

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=True)
    email = db.Column(db.String(120), unique=True, nullable=True)
    bitmessage = db.Column(db.String(120), unique=True, nullable=True)
    password = db.Column(db.String(255), nullable=False)
    two_factor_secret = db.Column(db.String(32), nullable=True)

class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    side = db.Column(db.String(4), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    price = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(10), default='open')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get('Authorization')
        if not token:
            return jsonify({'message': 'Token is missing!'}), 401
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = User.query.filter_by(id=data['user_id']).first()
        except:
            return jsonify({'message': 'Token is invalid!'}), 401
        return f(current_user, *args, **kwargs)
    return decorated

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(app.static_folder, path)

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    username_or_email = data.get('usernameOrEmail')
    password = data.get('password')

    if not username_or_email or not password:
        return jsonify({'message': 'Username/Email and password are required'}), 400

    if re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', username_or_email):
        existing_user = User.query.filter_by(email=username_or_email).first()
        if existing_user:
            return jsonify({'message': 'Email already registered'}), 400
        new_user = User(email=username_or_email, password=generate_password_hash(password, method='sha256'))
    elif re.match(r'^BM-[a-zA-Z0-9]{32,34}$', username_or_email):
        existing_user = User.query.filter_by(bitmessage=username_or_email).first()
        if existing_user:
            return jsonify({'message': 'Bitmessage address already registered'}), 400
        new_user = User(bitmessage=username_or_email, password=generate_password_hash(password, method='sha256'))
    else:
        return jsonify({'message': 'Invalid email or bitmessage address'}), 400

    db.session.add(new_user)
    db.session.commit()

    return jsonify({'message': 'Registered successfully'}), 201

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username_or_email = data.get('usernameOrEmail')
    password = data.get('password')

    if not username_or_email or not password:
        return jsonify({'message': 'Username/Email and password are required'}), 400

    if re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', username_or_email):
        user = User.query.filter_by(email=username_or_email).first()
    elif re.match(r'^BM-[a-zA-Z0-9]{32,34}$', username_or_email):
        user = User.query.filter_by(bitmessage=username_or_email).first()
    else:
        user = User.query.filter_by(username=username_or_email).first()

    if not user or not check_password_hash(user.password, password):
        return jsonify({'message': 'Invalid credentials'}), 401

    if user.two_factor_secret:
        return jsonify({'message': '2FA required', 'user_id': user.id}), 200

    token = jwt.encode({'user_id': user.id, 'exp': datetime.utcnow() + timedelta(hours=24)}, app.config['SECRET_KEY'])
    return jsonify({'token': token})

@app.route('/api/setup-2fa', methods=['POST'])
@token_required
def setup_2fa(current_user):
    if current_user.two_factor_secret:
        return jsonify({'message': '2FA is already set up'}), 400

    secret = pyotp.random_base32()
    current_user.two_factor_secret = secret
    db.session.commit()

    totp = pyotp.TOTP(secret)
    provisioning_url = totp.provisioning_uri(name=current_user.email or current_user.bitmessage, issuer_name="NightTrader")

    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(provisioning_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buffered = BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()

    return jsonify({'secret': secret, 'qr_code': img_str})

@app.route('/api/verify-2fa', methods=['POST'])
def verify_2fa():
    data = request.get_json()
    user_id = data.get('user_id')
    token = data.get('token')

    user = User.query.get(user_id)
    if not user or not user.two_factor_secret:
        return jsonify({'message': 'Invalid user or 2FA not set up'}), 400

    totp = pyotp.TOTP(user.two_factor_secret)
    if totp.verify(token):
        auth_token = jwt.encode({'user_id': user.id, 'exp': datetime.utcnow() + timedelta(hours=24)}, app.config['SECRET_KEY'])
        return jsonify({'token': auth_token})
    else:
        return jsonify({'message': 'Invalid 2FA token'}), 401

@app.route('/api/market')
def get_market_data():
    market_data = generate_market_data()
    return jsonify(market_data)

@app.route('/api/orderbook')
def get_order_book():
    order_book = generate_order_book()
    return jsonify(order_book)

@app.route('/api/order', methods=['POST'])
@token_required
def place_order(current_user):
    data = request.get_json()
    new_order = Order(
        user_id=current_user.id,
        side=data['side'],
        amount=data['amount'],
        price=data['price']
    )
    db.session.add(new_order)
    db.session.commit()
    return jsonify({'message': 'Order placed successfully'}), 201

@app.route('/api/historical-data')
def get_historical_data():
    data = generate_historical_data()
    return jsonify(data)

@socketio.on('connect')
def handle_connect():
    print('Client connected')
    emit('market_update', generate_market_data())
    emit('order_book_update', generate_order_book())

def generate_market_data():
    return {
        "lastPrice": f"{random.uniform(30000, 32000):.2f}",
        "change24h": f"{random.uniform(-5, 5):.2f}",
        "open": random.uniform(30000, 31000),
        "high": random.uniform(31000, 32000),
        "low": random.uniform(29000, 30000),
        "close": random.uniform(30000, 32000),
        "time": int(datetime.utcnow().timestamp())
    }

def generate_order_book():
    return {
        "asks": [{"price": random.uniform(31000, 32000), "amount": random.uniform(0.1, 2)} for _ in range(5)],
        "bids": [{"price": random.uniform(30000, 31000), "amount": random.uniform(0.1, 2)} for _ in range(5)]
    }

def generate_historical_data():
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)
    data = []
    current_date = start_date
    while current_date <= end_date:
        data.append({
            "time": current_date.strftime("%Y-%m-%d"),
            "open": random.uniform(30000, 31000),
            "high": random.uniform(31000, 32000),
            "low": random.uniform(29000, 30000),
            "close": random.uniform(30000, 32000)
        })
        current_date += timedelta(days=1)
    return data

def background_task():
    while True:
        socketio.sleep(5)
        socketio.emit('market_update', generate_market_data())
        socketio.emit('order_book_update', generate_order_book())

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    socketio.start_background_task(background_task)
    socketio.run(app, host='0.0.0.0', port=5000)
