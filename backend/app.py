
from flask import Flask, jsonify, render_template
from routes.auth import auth_bp
from routes.complaints import complaints_bp
from routes.admin import admin_bp
from pathlib import Path
import os

# Project paths
BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent

# Flask configuration for Lovable frontend
app = Flask(
    __name__,
    template_folder=str(PROJECT_DIR / "frontend" / "templates"),
    static_folder=str(PROJECT_DIR / "frontend" / "static"),
    static_url_path="/static"
)

# Upload configuration
app.config["UPLOAD_FOLDER"] = str(PROJECT_DIR / "uploads")
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024

os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

# Session security
app.secret_key = os.environ.get(
    "SECRET_KEY",
    "development-secret-change-before-deployment"
)

app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = False  # Local development only

# Register existing API blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(complaints_bp)
app.register_blueprint(admin_bp)


# Serve frontend
@app.route("/")
def home():
    return render_template("index.html")


# Backend health check
@app.route("/api/health")
def health():
    return jsonify({
        "project": "CampusFix",
        "status": "Backend Running Successfully",
        "version": "1.0"
    })


if __name__ == "__main__":
    app.run(debug=True)
