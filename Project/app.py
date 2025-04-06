from flask import Flask, render_template, jsonify, request, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_socketio import SocketIO
import os
import sqlite3
from datetime import datetime, timedelta
import random

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///disaster.db'  
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.static_folder = "static"

db = SQLAlchemy(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Database Model
class Alert(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    location = db.Column(db.String(255), nullable=False)
    severity = db.Column(db.String(50), nullable=False)
    description = db.Column(db.Text, nullable=False)
    latitude = db.Column(db.Float, default=20.5937)  # Default to center of India
    longitude = db.Column(db.Float, default=78.9629)  # Default to center of India
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class News(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

def check_database_schema():
    try:
        conn = sqlite3.connect('disaster.db')
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [table[0] for table in cursor.fetchall()]
        
        need_recreate = False
        
        if 'alert' in tables:
            cursor.execute("PRAGMA table_info(alert)")
            columns = [col[1] for col in cursor.fetchall()]
            expected_columns = ['id', 'location', 'severity', 'description', 'latitude', 'longitude', 'timestamp']
            missing_columns = [col for col in expected_columns if col not in columns]
            if missing_columns:
                print(f"Alert table missing columns: {missing_columns}")
                need_recreate = True
        else:
            need_recreate = True
        
        if 'news' in tables:
            cursor.execute("PRAGMA table_info(news)")
            columns = [col[1] for col in cursor.fetchall()]
            expected_columns = ['id', 'title', 'content', 'timestamp']
            missing_columns = [col for col in expected_columns if col not in columns]
            if missing_columns:
                print(f"News table missing columns: {missing_columns}")
                need_recreate = True
        else:
            need_recreate = True
        
        conn.close()
        
        if need_recreate:
            print("Database schema needs update. Recreating tables...")
            with app.app_context():
                db.drop_all()
                db.create_all()
                seed_database()
                print("Database tables recreated and seeded successfully.")
        else:
            print("Database schema is up to date.")
            
    except Exception as e:
        print("Error checking database schema:", str(e))
        print("Attempting to recreate database...")
        with app.app_context():
            db.drop_all()
            db.create_all()
            seed_database()
            print("Database tables recreated and seeded successfully.")

def seed_database():
    sample_alerts = [
        {'location': 'Mumbai, Maharashtra', 'severity': 'High', 'description': 'Heavy flooding reported.', 'latitude': 19.0760, 'longitude': 72.8777},
        {'location': 'Chennai, Tamil Nadu', 'severity': 'Moderate', 'description': 'Cyclone approaching.', 'latitude': 13.0827, 'longitude': 80.2707},
        {'location': 'Delhi NCR', 'severity': 'Critical', 'description': 'Severe air pollution.', 'latitude': 28.7041, 'longitude': 77.1025},
        {'location': 'Shimla, Himachal Pradesh', 'severity': 'Low', 'description': 'Minor landslides.', 'latitude': 31.1048, 'longitude': 77.1734}
    ]
    
    sample_news = [
        {'title': 'Flood Warning Issued', 'content': 'Flood warnings for western coastal regions.', 'timestamp': datetime.utcnow() - timedelta(hours=2)},
        {'title': 'Emergency Services in Chennai', 'content': 'NDRF teams deployed.', 'timestamp': datetime.utcnow() - timedelta(hours=5)},
        {'title': 'Delhi Schools Closed', 'content': 'Closure due to air quality.', 'timestamp': datetime.utcnow() - timedelta(hours=8)},
        {'title': 'Relief Camps in Maharashtra', 'content': 'Camps established for flood victims.', 'timestamp': datetime.utcnow() - timedelta(hours=12)}
    ]
    
    for alert_data in sample_alerts:
        alert = Alert(**alert_data)
        db.session.add(alert)
    
    for news_data in sample_news:
        news = News(**news_data)
        db.session.add(news)
    
    db.session.commit()

check_database_schema()

# Routes
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/auth")
def auth():
    return render_template("auth.html")

@app.route("/news")
def news():
    return render_template("news.html")

@app.route("/alerts")
def alerts():
    return render_template("alerts.html")

@app.route("/contact")
def contact():
    return render_template("contact.html")

@app.route("/map")
def map():
    return render_template("map.html")

@app.route("/firstaid")
def firstaid():
    return render_template("firstaid.html")

@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")

@app.route("/get_alerts")
def get_alerts():
    try:
        alerts = Alert.query.order_by(Alert.timestamp.desc()).all()
        alert_list = [{"id": a.id, "location": a.location, "severity": a.severity, "description": a.description, "latitude": a.latitude, "longitude": a.longitude, "timestamp": a.timestamp.isoformat()} for a in alerts]
        return jsonify(alert_list)
    except Exception as e:
        print("Error fetching alerts:", str(e))
        return jsonify({"error": "Failed to fetch alerts"}), 500

@app.route("/send_alert", methods=["POST"])
def send_alert():
    try:
        data = request.get_json()
        location = data.get("location")
        severity = data.get("severity")
        description = data.get("description")
        latitude = data.get("latitude", 20.5937)
        longitude = data.get("longitude", 78.9629)

        if not location or not severity or not description:
            return jsonify({"error": "All fields are required"}), 400

        new_alert = Alert(location=location, severity=severity, description=description, latitude=latitude, longitude=longitude, timestamp=datetime.utcnow())
        db.session.add(new_alert)
        db.session.commit()

        new_news = News(title=f"New {severity} Alert: {location}", content=description, timestamp=datetime.utcnow())
        db.session.add(new_news)
        db.session.commit()

        socketio.emit("new_alert", {"id": new_alert.id, "location": location, "severity": severity, "description": description, "latitude": latitude, "longitude": longitude, "timestamp": new_alert.timestamp.isoformat()})
        return jsonify({"message": "Alert sent successfully!"}), 200
    except Exception as e:
        db.session.rollback()
        print("Error saving alert:", str(e))
        return jsonify({"error": f"Failed to save alert: {str(e)}"}), 500

@app.route("/get_news")
def get_news():
    try:
        news_items = News.query.order_by(News.timestamp.desc()).all()
        news_list = [{"id": item.id, "title": item.title, "content": item.content, "timestamp": item.timestamp.isoformat()} for item in news_items]
        return jsonify(news_list)
    except Exception as e:
        print("Error fetching news:", str(e))
        return jsonify({"error": "Failed to fetch news"}), 500

if __name__ == "__main__":
    socketio.run(app, debug=True, allow_unsafe_werkzeug=True)