import sqlite3
import os

# Database location
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATABASE_PATH = os.path.join(BASE_DIR, "campusfix.db")

def get_connection():

    connection = sqlite3.connect(DATABASE_PATH)

    # Enable foreign key constraints
    connection.execute("PRAGMA foreign_keys = ON")

    # Return rows like dictionaries
    connection.row_factory = sqlite3.Row

    return connection
def create_tables():

    connection = get_connection()

    cursor = connection.cursor()

    # USERS TABLE
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            name TEXT NOT NULL,

            email TEXT UNIQUE NOT NULL,

            password TEXT NOT NULL,

            role TEXT NOT NULL DEFAULT 'student',

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP

        )
    """)

    # COMPLAINTS TABLE
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS complaints (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            tracking_id TEXT UNIQUE NOT NULL,

            user_id INTEGER NOT NULL,

            title TEXT NOT NULL,

            description TEXT NOT NULL,

            category TEXT NOT NULL,

            location TEXT NOT NULL,

            image TEXT,

            priority TEXT DEFAULT 'Medium',

            status TEXT DEFAULT 'Pending',

            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE

        )
    """)

    # COMPLAINT UPDATES TABLE
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS complaint_updates (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            complaint_id INTEGER NOT NULL,

            old_status TEXT,

            new_status TEXT NOT NULL,

            updated_by INTEGER NOT NULL,

            remarks TEXT,

            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

            FOREIGN KEY (complaint_id)
            REFERENCES complaints(id)
            ON DELETE CASCADE,

            FOREIGN KEY (updated_by)
            REFERENCES users(id)

        )
    """)

    connection.commit()

    connection.close()

    print("CampusFix database tables created successfully!")

if __name__ == "__main__":

    create_tables()