
import os
import uuid
import secrets

from flask import Blueprint, request, jsonify, session, current_app
from werkzeug.utils import secure_filename
from flask import (
    Blueprint, request, jsonify, session,
    current_app, send_from_directory
)
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


def allowed_file(filename):
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
    )


def save_complaint_image(image):
    if not image or not image.filename:
        return None

    if not allowed_file(image.filename):
        raise ValueError(
            "Only PNG, JPG, JPEG and WEBP images are allowed"
        )

    extension = image.filename.rsplit(".", 1)[1].lower()
    image_filename = f"{uuid.uuid4().hex}.{extension}"

    upload_folder = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(upload_folder, exist_ok=True)

    image.save(os.path.join(upload_folder, image_filename))

    return image_filename


def generate_tracking_id():
    # High-entropy tracking reference; not based on the database row ID.
    return f"CF-{secrets.token_urlsafe(18)}"


# 1. SUBMIT COMPLAINT
@complaints_bp.route("", methods=["POST"])
def create_complaint():

    # Accept true/false from multipart form data.
    is_anonymous = request.form.get(
        "is_anonymous", "false"
    ).strip().lower() in ("true", "1", "yes")

    user = get_logged_in_user()

    # Confidential submissions require a logged-in account.
    if not is_anonymous and not user:
        return jsonify({
            "success": False,
            "message": "Please login to submit a confidential complaint"
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

    try:
        image_filename = save_complaint_image(image)
    except ValueError as error:
        return jsonify({
            "success": False,
            "message": str(error)
        }), 400

    connection = get_connection()

    try:
        cursor = connection.cursor()

        tracking_id = generate_tracking_id()

        cursor.execute("""
            INSERT INTO complaints (
                tracking_id,
                user_id,
                is_anonymous,
                title,
                description,
                category,
                location,
                image,
                priority,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            tracking_id,
            None if is_anonymous else user["id"],
            1 if is_anonymous else 0,
            title,
            description,
            category,
            location,
            image_filename,
            "Medium",
            "Pending"
        ))

        complaint_id = cursor.lastrowid

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
            None if is_anonymous else user["id"],
            "Anonymous complaint submitted"
            if is_anonymous else "Complaint submitted"
        ))

        connection.commit()

        return jsonify({
            "success": True,
            "message": "Complaint submitted successfully",
            "tracking_id": tracking_id,
            "is_anonymous": is_anonymous
        }), 201

    except Exception:
        connection.rollback()

        if image_filename:
            image_path = os.path.join(
                current_app.config["UPLOAD_FOLDER"],
                image_filename
            )
            if os.path.exists(image_path):
                os.remove(image_path)

        current_app.logger.exception("Complaint submission failed")

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

        is_anonymous = bool(complaint["is_anonymous"])

        # Anonymous complaints can be tracked using their secret tracking ID.

        # Confidential complaints require their owner or an administrator.
        if not is_anonymous:
            if not user:
                return jsonify({
                    "success": False,
                    "message": "Login required to view this complaint"
                }), 401

            if user["role"] != "admin" and complaint["user_id"] != user["id"]:
                return jsonify({
                    "success": False,
                    "message": "Access denied"
                }), 403

        updates = connection.execute("""
    SELECT
        complaint_updates.old_status,
        complaint_updates.new_status,
        complaint_updates.remarks,
        complaint_updates.updated_at,
        COALESCE(users.name, 'System') AS updated_by_name
    FROM complaint_updates
    LEFT JOIN users
        ON complaint_updates.updated_by = users.id
    WHERE complaint_id = ?
    ORDER BY updated_at ASC, complaint_updates.id ASC
    """, (complaint["id"],)).fetchall()
        # Do not expose account-related fields in anonymous tracking responses.
        if is_anonymous and (not user or user["role"] != "admin"):
            safe_complaint = {
                key: complaint[key]
                for key in (
                    "tracking_id",
                    "title",
                    "description",
                    "category",
                    "location",
                    "image",
                    "priority",
                    "status",
                    "created_at"
                )
            }
        else:
            safe_complaint = dict(complaint)

        return jsonify({
            "success": True,
            "complaint": safe_complaint,
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
            LEFT JOIN users
                ON complaints.user_id = users.id
            ORDER BY complaints.created_at DESC
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
        current_app.logger.exception("Complaint status update failed")

        return jsonify({
            "success": False,
            "message": "Unable to update complaint"
        }), 500

    finally:
        connection.close()
# 6. VIEW COMPLAINT IMAGE
@complaints_bp.route("/<tracking_id>/image", methods=["GET"])
def complaint_image(tracking_id):
    user = get_logged_in_user()
    connection = get_connection()

    try:
        complaint = connection.execute("""
            SELECT user_id, is_anonymous, image
            FROM complaints
            WHERE tracking_id = ?
        """, (tracking_id,)).fetchone()

        if not complaint or not complaint["image"]:
            return jsonify({"message": "Image not found"}), 404

        is_anonymous = bool(complaint["is_anonymous"])

        if not is_anonymous:
            if not user:
                return jsonify({"message": "Login required"}), 401

            if user["role"] != "admin" and complaint["user_id"] != user["id"]:
                return jsonify({"message": "Access denied"}), 403

        return send_from_directory(
            current_app.config["UPLOAD_FOLDER"],
            complaint["image"]
        )

    finally:
        connection.close()