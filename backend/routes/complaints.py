import os
import uuid
import sqlite3

from flask import Blueprint, request, jsonify, session, current_app
from werkzeug.utils import secure_filename

from database import get_connection

complaints_bp = Blueprint(
    "complaints",
    __name__,
    url_prefix="/api/complaints"
)

ALLOWED_CATEGORIES = [
    "Electrical",
    "Plumbing",
    "Cleanliness",
    "Furniture",
    "Infrastructure",
    "Internet/Wi-Fi",
    "Other"
]

ALLOWED_STATUSES = [
    "Pending",
    "In Progress",
    "Resolved"
]

ALLOWED_PRIORITIES = [
    "Low",
    "Medium",
    "High",
    "Critical"
]

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}


# Check whether user is logged in
def get_logged_in_user():

    user_id = session.get("user_id")

    if not user_id:
        return None

    connection = get_connection()

    try:
        user = connection.execute(
            "SELECT id, name, email, role FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()

        return dict(user) if user else None

    finally:
        connection.close()


# Check whether image format is allowed
def allowed_file(filename):

    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
    )


# 1. SUBMIT COMPLAINT
@complaints_bp.route("", methods=["POST"])
def create_complaint():

    user = get_logged_in_user()

    if not user:
        return jsonify({
            "success": False,
            "message": "Please login first"
        }), 401

    title = request.form.get("title", "").strip()
    description = request.form.get("description", "").strip()
    category = request.form.get("category", "").strip()
    location = request.form.get("location", "").strip()

    if not all([title, description, category, location]):
        return jsonify({
            "success": False,
            "message": "All complaint fields are required"
        }), 400

    if len(title) > 150 or len(description) > 3000:
        return jsonify({
            "success": False,
            "message": "Title or description is too long"
        }), 400

    if category not in ALLOWED_CATEGORIES:
        return jsonify({
            "success": False,
            "message": "Invalid complaint category"
        }), 400

    image = request.files.get("image")
    image_filename = None

    if image and image.filename:

        if not allowed_file(image.filename):
            return jsonify({
                "success": False,
                "message": "Only PNG, JPG, JPEG and WEBP images are allowed"
            }), 400

        extension = image.filename.rsplit(".", 1)[1].lower()

        image_filename = f"{uuid.uuid4().hex}.{extension}"

        upload_folder = current_app.config["UPLOAD_FOLDER"]

        os.makedirs(upload_folder, exist_ok=True)

        image.save(os.path.join(upload_folder, image_filename))

    connection = get_connection()

    try:

        cursor = connection.cursor()

        # Insert complaint first
        cursor.execute("""
            INSERT INTO complaints (
                tracking_id,
                user_id,
                title,
                description,
                category,
                location,
                image,
                priority,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "TEMP",
            user["id"],
            title,
            description,
            category,
            location,
            image_filename,
            "Medium",
            "Pending"
        ))

        complaint_id = cursor.lastrowid

        # Generate unique tracking ID
        tracking_id = f"CF-{complaint_id:06d}"

        cursor.execute("""
            UPDATE complaints
            SET tracking_id = ?
            WHERE id = ?
        """, (tracking_id, complaint_id))

        # Create initial status history
        cursor.execute("""
            INSERT INTO complaint_updates (
                complaint_id,
                old_status,
                new_status,
                updated_by,
                remarks
            )
            VALUES (?, ?, ?, ?, ?)
        """, (
            complaint_id,
            None,
            "Pending",
            user["id"],
            "Complaint submitted"
        ))

        connection.commit()

        return jsonify({
            "success": True,
            "message": "Complaint submitted successfully",
            "tracking_id": tracking_id
        }), 201

    except Exception:

        connection.rollback()

        # Remove saved image if database operation failed
        if image_filename:
            image_path = os.path.join(
                current_app.config["UPLOAD_FOLDER"],
                image_filename
            )

            if os.path.exists(image_path):
                os.remove(image_path)

        return jsonify({
            "success": False,
            "message": "Unable to submit complaint"
        }), 500

    finally:
        connection.close()


# 2. VIEW MY COMPLAINTS
@complaints_bp.route("/my", methods=["GET"])
def my_complaints():

    user = get_logged_in_user()

    if not user:
        return jsonify({
            "success": False,
            "message": "Please login first"
        }), 401

    connection = get_connection()

    try:

        complaints = connection.execute("""
            SELECT *
            FROM complaints
            WHERE user_id = ?
            ORDER BY created_at DESC
        """, (user["id"],)).fetchall()

        return jsonify({
            "success": True,
            "complaints": [dict(row) for row in complaints]
        }), 200

    finally:
        connection.close()


# 3. VIEW COMPLAINT DETAILS
@complaints_bp.route("/<tracking_id>", methods=["GET"])
def complaint_details(tracking_id):

    user = get_logged_in_user()

    if not user:
        return jsonify({
            "success": False,
            "message": "Please login first"
        }), 401

    connection = get_connection()

    try:

        complaint = connection.execute("""
            SELECT *
            FROM complaints
            WHERE tracking_id = ?
        """, (tracking_id,)).fetchone()

        if not complaint:
            return jsonify({
                "success": False,
                "message": "Complaint not found"
            }), 404

        # Students can only see their own complaints
        if user["role"] != "admin" and complaint["user_id"] != user["id"]:
            return jsonify({
                "success": False,
                "message": "Access denied"
            }), 403

        updates = connection.execute("""
            SELECT
                complaint_updates.*,
                users.name AS updated_by_name
            FROM complaint_updates
            JOIN users
            ON complaint_updates.updated_by = users.id
            WHERE complaint_id = ?
            ORDER BY updated_at ASC, id ASC
        """, (complaint["id"],)).fetchall()

        return jsonify({
            "success": True,
            "complaint": dict(complaint),
            "history": [dict(row) for row in updates]
        }), 200

    finally:
        connection.close()


# 4. ADMIN VIEW ALL COMPLAINTS
@complaints_bp.route("", methods=["GET"])
def all_complaints():

    user = get_logged_in_user()

    if not user:
        return jsonify({
            "success": False,
            "message": "Please login first"
        }), 401

    if user["role"] != "admin":
        return jsonify({
            "success": False,
            "message": "Admin access required"
        }), 403

    connection = get_connection()

    try:

        complaints = connection.execute("""
            SELECT
                complaints.*,
                users.name AS student_name,
                users.email AS student_email
            FROM complaints
            JOIN users
            ON complaints.user_id = users.id
            ORDER BY created_at DESC
        """).fetchall()

        return jsonify({
            "success": True,
            "complaints": [dict(row) for row in complaints]
        }), 200

    finally:
        connection.close()


# 5. ADMIN UPDATE COMPLAINT STATUS
@complaints_bp.route("/<tracking_id>/status", methods=["PATCH"])
def update_complaint_status(tracking_id):

    user = get_logged_in_user()

    if not user:
        return jsonify({
            "success": False,
            "message": "Please login first"
        }), 401

    if user["role"] != "admin":
        return jsonify({
            "success": False,
            "message": "Admin access required"
        }), 403

    data = request.get_json(silent=True) or {}

    new_status = data.get("status")
    remarks = data.get("remarks", "").strip()

    if new_status not in ALLOWED_STATUSES:
        return jsonify({
            "success": False,
            "message": "Invalid complaint status"
        }), 400

    connection = get_connection()

    try:

        cursor = connection.cursor()

        complaint = cursor.execute("""
            SELECT *
            FROM complaints
            WHERE tracking_id = ?
        """, (tracking_id,)).fetchone()

        if not complaint:
            return jsonify({
                "success": False,
                "message": "Complaint not found"
            }), 404

        old_status = complaint["status"]

        if old_status == new_status:
            return jsonify({
                "success": False,
                "message": "Complaint already has this status"
            }), 400

        cursor.execute("""
            UPDATE complaints
            SET status = ?
            WHERE tracking_id = ?
        """, (new_status, tracking_id))

        cursor.execute("""
            INSERT INTO complaint_updates (
                complaint_id,
                old_status,
                new_status,
                updated_by,
                remarks
            )
            VALUES (?, ?, ?, ?, ?)
        """, (
            complaint["id"],
            old_status,
            new_status,
            user["id"],
            remarks or "Status updated by administrator"
        ))

        connection.commit()

        return jsonify({
            "success": True,
            "message": "Complaint status updated",
            "tracking_id": tracking_id,
            "old_status": old_status,
            "new_status": new_status
        }), 200

    except Exception:

        connection.rollback()

        return jsonify({
            "success": False,
            "message": "Unable to update complaint"
        }), 500

    finally:
        connection.close()