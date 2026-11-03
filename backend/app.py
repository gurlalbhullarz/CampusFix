from flask import Flask, jsonify
from routes.auth import auth_bp
import os

app = Flask(__name__)

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


@app.route("/")
def home():

    return jsonify({
        "project": "CampusFix",
        "status": "Backend Running Successfully",
        "version": "1.0"
    })


if __name__ == "__main__":
    app.run(debug=True)