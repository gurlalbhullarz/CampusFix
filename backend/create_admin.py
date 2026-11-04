from database import get_connection
from werkzeug.security import generate_password_hash
import getpass


def create_admin():

    print("===== CampusFix Admin Creation =====")

    name = input("Enter admin name: ").strip()
    email = input("Enter admin email: ").strip().lower()
    password = getpass.getpass("Enter admin password: ")

    if not name or not email or len(password) < 8:
        print("Invalid details. Password must have at least 8 characters.")
        return

    connection = get_connection()

    try:

        hashed_password = generate_password_hash(password)

        connection.execute("""
            INSERT INTO users (name, email, password, role)
            VALUES (?, ?, ?, ?)
        """, (name, email, hashed_password, "admin"))

        connection.commit()

        print("Admin account created successfully!")

    except Exception:
        connection.rollback()
        print("Unable to create admin. Email may already exist.")

    finally:
        connection.close()


if __name__ == "__main__":
    create_admin()