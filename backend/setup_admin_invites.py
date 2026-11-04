
import secrets
from database import get_connection
from werkzeug.security import generate_password_hash


def setup_admin_invites():
    connection = get_connection()

    try:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS admin_invites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code_hash TEXT UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                used_at TIMESTAMP,
                used_by INTEGER,
                FOREIGN KEY (used_by)
                    REFERENCES users(id)
                    ON DELETE SET NULL
            )
        """)

        existing = connection.execute("""
            SELECT COUNT(*) AS total
            FROM admin_invites
        """).fetchone()["total"]

        if existing > 0:
            print("\nInvitation codes already exist.")
            print("No new codes were generated.")
            print("This prevents accidentally replacing your existing codes.")
            connection.commit()
            return

        codes = []

        for _ in range(5):
            code = "CFX-ADMIN-" + secrets.token_hex(8).upper()
            codes.append(code)

            connection.execute("""
                INSERT INTO admin_invites (code_hash)
                VALUES (?)
            """, (generate_password_hash(code),))

        connection.commit()

        print("\n========================================")
        print(" CAMPUSFIX - ADMIN INVITATION CODES")
        print("========================================")
        print("Save these codes privately. They are shown only once.\n")

        for number, code in enumerate(codes, start=1):
            print(f"Admin Invitation {number}: {code}")

        print("\n========================================")
        print("Each code can create ONE admin account.")
        print("Keep these codes private. Do not upload them to GitHub.")
        print("========================================\n")

    except Exception as error:
        connection.rollback()
        print("Setup failed:", error)

    finally:
        connection.close()


if __name__ == "__main__":
    setup_admin_invites()
