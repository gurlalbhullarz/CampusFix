
from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
from database import get_connection

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def validate_registration(data):
    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not isinstance(password, str):
        password = ""

    if not name or not email or not password:
        return None, None, None, "All fields are required"

    if "@" not in email or "." not in email.split("@")[-1]:
        return None, None, None, "Invalid email address"

    if len(password) < 8:
        return None, None, None, "Password must contain at least 8 characters"

    return name, email, password, None


# STUDENT REGISTRATION
@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    name, email, password, error = validate_registration(data)

    if error:
        return jsonify({"success": False, "message": error}), 400

    connection = get_connection()

    try:
        hashed_password = generate_password_hash(password)

        connection.execute("""
            INSERT INTO users (name, email, password, role)
            VALUES (?, ?, ?, 'student')
        """, (name, email, hashed_password))

        connection.commit()

        return jsonify({
            "success": True,
            "message": "Student registration successful"
        }), 201

    except Exception as error:
        connection.rollback()

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


# ADMIN REGISTRATION - REQUIRES ONE-TIME INVITATION CODE
@auth_bp.route("/admin/register", methods=["POST"])
def admin_register():
    data = request.get_json(silent=True) or {}

    name, email, password, error = validate_registration(data)
    invitation_code = data.get("invitation_code", "")

    if error:
        return jsonify({"success": False, "message": error}), 400

    if not isinstance(invitation_code, str) or not invitation_code.strip():
        return jsonify({
            "success": False,
            "message": "Admin invitation code is required"
        }), 400

    invitation_code = invitation_code.strip()

    connection = get_connection()

    try:
        # Lock the database for this transaction so a code
        # cannot be used by two registrations simultaneously.
        connection.execute("BEGIN IMMEDIATE")

        invitations = connection.execute("""
            SELECT id, code_hash
            FROM admin_invites
            WHERE used_at IS NULL
        """).fetchall()

        matched_invite = None

        for invite in invitations:
            if check_password_hash(invite["code_hash"], invitation_code):
                matched_invite = invite
                break

        if matched_invite is None:
            connection.rollback()
            return jsonify({
                "success": False,
                "message": "Invalid or already used invitation code"
            }), 403

        hashed_password = generate_password_hash(password)

        cursor = connection.execute("""
            INSERT INTO users (name, email, password, role)
            VALUES (?, ?, ?, 'admin')
        """, (name, email, hashed_password))

        admin_id = cursor.lastrowid

        # Consume the invitation code permanently.
        result = connection.execute("""
            UPDATE admin_invites
            SET used_at = CURRENT_TIMESTAMP,
                used_by = ?
            WHERE id = ? AND used_at IS NULL
        """, (admin_id, matched_invite["id"]))

        if result.rowcount != 1:
            connection.rollback()
            return jsonify({
                "success": False,
                "message": "Invitation code has already been used"
            }), 403

        connection.commit()

        return jsonify({
            "success": True,
            "message": "Admin account created successfully. You can now log in."
        }), 201

    except Exception as error:
        connection.rollback()

        if "UNIQUE constraint failed" in str(error):
            return jsonify({
                "success": False,
                "message": "Email already registered"
            }), 409

        print("Admin registration error:", error)

        return jsonify({
            "success": False,
            "message": "Admin registration failed"
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
        user = connection.execute("""
            SELECT *
            FROM users
            WHERE email = ?
        """, (email,)).fetchone()

        if user is None or not check_password_hash(
            user["password"], password
        ):
            return jsonify({
                "success": False,
                "message": "Invalid email or password"
            }), 401

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
        user = connection.execute("""
            SELECT id, name, email, role
            FROM users
            WHERE id = ?
        """, (user_id,)).fetchone()

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
