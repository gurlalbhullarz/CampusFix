from flask import Flask, jsonify
from routes.auth import auth_bp
from routes.complaints import complaints_bp
import os

app = Flask(__name__)
# Database location
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app.config["UPLOAD_FOLDER"] = os.path.join(
    os.path.dirname(BASE_DIR),
    "uploads"
)

app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024

# Session security
app.secret_key = os.environ.get(
    "SECRET_KEY",
    "development-secret-change-before-deployment"
)

app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = False  # Local development only


# Register authentication routes
app.register_blueprint(auth_bp)

# Register complaints routes
app.register_blueprint(complaints_bp)


@app.route("/")
def home():

    return jsonify({
        "project": "CampusFix",
        "status": "Backend Running Successfully",
        "version": "1.0"
    })


if __name__ == "__main__":
    app.run(debug=True)