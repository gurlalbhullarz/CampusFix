from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
from database import get_connection

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


# STUDENT REGISTRATION
@auth_bp.route("/register", methods=["POST"])
def register():

    data = request.get_json(silent=True) or {}

    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    # Validate inputs
    if not name or not email or not password:
        return jsonify({
            "success": False,
            "message": "All fields are required"
        }), 400

    if "@" not in email or "." not in email.split("@")[-1]:
        return jsonify({
            "success": False,
            "message": "Invalid email address"
        }), 400

    if len(password) < 8:
        return jsonify({
            "success": False,
            "message": "Password must contain at least 8 characters"
        }), 400

    # Hash password
    hashed_password = generate_password_hash(password)

    connection = get_connection()

    try:

        cursor = connection.cursor()

        cursor.execute("""
            INSERT INTO users (name, email, password, role)
            VALUES (?, ?, ?, ?)
        """, (name, email, hashed_password, "student"))

        connection.commit()

        return jsonify({
            "success": True,
            "message": "Registration successful"
        }), 201

    except Exception as error:

        if "UNIQUE constraint failed" in str(error):
            return jsonify({
                "success": False,
                "message": "Email already registered"
            }), 409

        return jsonify({
            "success": False,
            "message": "Registration failed"
        }), 500

    finally:
        connection.close()


# USER LOGIN
@auth_bp.route("/login", methods=["POST"])
def login():

    data = request.get_json(silent=True) or {}

    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({
            "success": False,
            "message": "Email and password are required"
        }), 400

    connection = get_connection()

    try:

        cursor = connection.cursor()

        cursor.execute("""
            SELECT * FROM users
            WHERE email = ?
        """, (email,))

        user = cursor.fetchone()

        if user is None or not check_password_hash(
            user["password"], password
        ):
            return jsonify({
                "success": False,
                "message": "Invalid email or password"
            }), 401

        # Start user session
        session.clear()
        session["user_id"] = user["id"]

        return jsonify({
            "success": True,
            "message": "Login successful",
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"],
                "role": user["role"]
            }
        }), 200

    finally:
        connection.close()


# GET CURRENT LOGGED-IN USER
@auth_bp.route("/me", methods=["GET"])
def current_user():

    user_id = session.get("user_id")

    if not user_id:
        return jsonify({
            "success": False,
            "message": "Please login first"
        }), 401

    connection = get_connection()

    try:

        cursor = connection.cursor()

        cursor.execute("""
            SELECT id, name, email, role
            FROM users
            WHERE id = ?
        """, (user_id,))

        user = cursor.fetchone()

        if user is None:
            session.clear()

            return jsonify({
                "success": False,
                "message": "User not found"
            }), 404

        return jsonify({
            "success": True,
            "user": dict(user)
        }), 200

    finally:
        connection.close()


# USER LOGOUT
@auth_bp.route("/logout", methods=["POST"])
def logout():

    session.clear()

    return jsonify({
        "success": True,
        "message": "Logout successful"
    }), 200