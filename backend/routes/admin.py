
from flask import Blueprint, jsonify, request, session
from datetime import datetime, timezone
from database import get_connection


admin_bp = Blueprint(
    "admin",
    __name__,
    url_prefix="/api/admin"
)


# ==================================================
# ADMIN AUTHORIZATION
# ==================================================

def check_admin():

    user_id = session.get("user_id")

    if not user_id:
        return None

    connection = get_connection()

    try:
        user = connection.execute("""
            SELECT id, name, email, role
            FROM users
            WHERE id = ?
        """, (user_id,)).fetchone()

        if user and user["role"] == "admin":
            return dict(user)

        return None

    finally:
        connection.close()


# ==================================================
# 1. ADMIN DASHBOARD + CHART.JS ANALYTICS
# ==================================================

@admin_bp.route("/dashboard", methods=["GET"])
def dashboard():

    admin = check_admin()

    if not admin:
        return jsonify({
            "success": False,
            "message": "Admin access required"
        }), 403

    connection = get_connection()

    try:

        # A. SUMMARY STATISTICS

        total = connection.execute("""
            SELECT COUNT(*) FROM complaints
        """).fetchone()[0]

        pending = connection.execute("""
            SELECT COUNT(*) FROM complaints
            WHERE status = 'Pending'
        """).fetchone()[0]

        in_progress = connection.execute("""
            SELECT COUNT(*) FROM complaints
            WHERE status = 'In Progress'
        """).fetchone()[0]

        resolved = connection.execute("""
            SELECT COUNT(*) FROM complaints
            WHERE status = 'Resolved'
        """).fetchone()[0]


        # B. STATUS CHART

        status_counts = {
            "Pending": pending,
            "In Progress": in_progress,
            "Resolved": resolved
        }

        status_chart = {
            "labels": list(status_counts.keys()),
            "values": list(status_counts.values())
        }


        # C. CATEGORY CHART

        category_names = [
            "Electrical",
            "Plumbing",
            "Cleanliness",
            "Furniture",
            "Infrastructure",
            "Internet/Wi-Fi",
            "Other"
        ]

        category_stats = connection.execute("""
            SELECT category, COUNT(*) AS total
            FROM complaints
            GROUP BY category
        """).fetchall()

        category_counts = {
            row["category"]: row["total"]
            for row in category_stats
        }

        # Preserve existing API response
        categories = [
            dict(row) for row in category_stats
        ]

        category_chart = {
            "labels": category_names,
            "values": [
                category_counts.get(name, 0)
                for name in category_names
            ]
        }


        # D. PRIORITY CHART

        priority_names = [
            "Low",
            "Medium",
            "High",
            "Critical"
        ]

        priority_stats = connection.execute("""
            SELECT priority, COUNT(*) AS total
            FROM complaints
            GROUP BY priority
        """).fetchall()

        priority_counts = {
            row["priority"]: row["total"]
            for row in priority_stats
        }

        # Preserve existing API response
        priorities = [
            dict(row) for row in priority_stats
        ]

        priority_chart = {
            "labels": priority_names,
            "values": [
                priority_counts.get(name, 0)
                for name in priority_names
            ]
        }


        # E. MONTHLY COMPLAINT TRENDS
        # Last 6 months including current month

        current_month = datetime.now(
            timezone.utc
        ).date().replace(day=1)

        month_starts = []

        for offset in range(5, -1, -1):

            month_index = (
                current_month.year * 12
                + current_month.month - 1
                - offset
            )

            year, month_index = divmod(
                month_index, 12
            )

            month_starts.append(
                datetime(
                    year,
                    month_index + 1,
                    1
                ).date()
            )

        # Calculate first day of next month

        next_month_index = (
            current_month.year * 12
            + current_month.month
        )

        end_year, end_month_index = divmod(
            next_month_index, 12
        )

        end_date = datetime(
            end_year,
            end_month_index + 1,
            1
        ).date()

        start_date = month_starts[0]

        monthly_stats = connection.execute("""
            SELECT
                strftime('%Y-%m', created_at) AS month,
                COUNT(*) AS total
            FROM complaints
            WHERE created_at >= ?
              AND created_at < ?
            GROUP BY strftime('%Y-%m', created_at)
            ORDER BY month
        """, (
            start_date.isoformat(),
            end_date.isoformat()
        )).fetchall()

        monthly_counts = {
            row["month"]: row["total"]
            for row in monthly_stats
        }

        monthly_chart = {
            "labels": [
                month.strftime("%b %Y")
                for month in month_starts
            ],
            "values": [
                monthly_counts.get(
                    month.strftime("%Y-%m"), 0
                )
                for month in month_starts
            ]
        }


        # F. FINAL API RESPONSE

        return jsonify({

            "success": True,

            # Existing dashboard fields
            "statistics": {
                "total": total,
                "pending": pending,
                "in_progress": in_progress,
                "resolved": resolved
            },

            "categories": categories,
            "priorities": priorities,

            # New Chart.js fields
            "status_chart": status_chart,
            "category_chart": category_chart,
            "priority_chart": priority_chart,
            "monthly_chart": monthly_chart

        }), 200

    except Exception as error:

        print("Dashboard analytics error:", error)

        return jsonify({
            "success": False,
            "message": "Unable to load dashboard analytics"
        }), 500

    finally:
        connection.close()


# ==================================================
# 2. FILTER AND SEARCH COMPLAINTS
# ==================================================

@admin_bp.route("/complaints", methods=["GET"])
def filter_complaints():

    admin = check_admin()

    if not admin:
        return jsonify({
            "success": False,
            "message": "Admin access required"
        }), 403

    status = request.args.get("status")
    category = request.args.get("category")
    priority = request.args.get("priority")
    search = request.args.get("search", "").strip()

    if status and status not in [
        "Pending", "In Progress", "Resolved"
    ]:
        return jsonify({
            "success": False,
            "message": "Invalid status"
        }), 400

    if category and category not in [
        "Electrical",
        "Plumbing",
        "Cleanliness",
        "Furniture",
        "Infrastructure",
        "Internet/Wi-Fi",
        "Other"
    ]:
        return jsonify({
            "success": False,
            "message": "Invalid category"
        }), 400

    if priority and priority not in [
        "Low", "Medium", "High", "Critical"
    ]:
        return jsonify({
            "success": False,
            "message": "Invalid priority"
        }), 400

    query = """
        SELECT
            complaints.*,
            users.name AS student_name,
            users.email AS student_email
        FROM complaints
        LEFT JOIN users
            ON complaints.user_id = users.id
        WHERE 1=1
    """

    parameters = []

    if status:
        query += " AND complaints.status = ?"
        parameters.append(status)

    if category:
        query += " AND complaints.category = ?"
        parameters.append(category)

    if priority:
        query += " AND complaints.priority = ?"
        parameters.append(priority)

    if search:

        query += """
            AND (
                complaints.tracking_id LIKE ?
                OR complaints.title LIKE ?
                OR users.name LIKE ?
            )
        """

        search_value = f"%{search}%"
        parameters.extend([search_value] * 3)

    query += " ORDER BY complaints.created_at DESC"

    connection = get_connection()

    try:

        complaints = connection.execute(
            query, parameters
        ).fetchall()

        return jsonify({
            "success": True,
            "count": len(complaints),
            "complaints": [
                dict(row) for row in complaints
            ]
        }), 200

    finally:
        connection.close()


# ==================================================
# 3. UPDATE COMPLAINT PRIORITY
# ==================================================

@admin_bp.route(
    "/complaints/<tracking_id>/priority",
    methods=["PATCH"]
)
def update_priority(tracking_id):

    admin = check_admin()

    if not admin:
        return jsonify({
            "success": False,
            "message": "Admin access required"
        }), 403

    data = request.get_json(silent=True) or {}

    priority = data.get("priority")

    if priority not in [
        "Low", "Medium", "High", "Critical"
    ]:
        return jsonify({
            "success": False,
            "message": "Invalid priority"
        }), 400

    connection = get_connection()

    try:

        cursor = connection.cursor()

        complaint = cursor.execute("""
            SELECT id FROM complaints
            WHERE tracking_id = ?
        """, (tracking_id,)).fetchone()

        if not complaint:
            return jsonify({
                "success": False,
                "message": "Complaint not found"
            }), 404

        cursor.execute("""
            UPDATE complaints
            SET priority = ?
            WHERE tracking_id = ?
        """, (priority, tracking_id))

        connection.commit()

        return jsonify({
            "success": True,
            "message": "Priority updated successfully",
            "tracking_id": tracking_id,
            "priority": priority
        }), 200

    except Exception as error:

        connection.rollback()

        print("Priority update error:", error)

        return jsonify({
            "success": False,
            "message": "Unable to update priority"
        }), 500

    finally:
        connection.close()
