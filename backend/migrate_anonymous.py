
import sqlite3
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_DIR = os.path.join(BASE_DIR, "database")
DATABASE_PATH = os.path.join(DATABASE_DIR, "campusfix.db")

def migrate_database():

    connection = sqlite3.connect(DATABASE_PATH)

    try:
        # Disable FK checks during table rebuilding
        connection.execute("PRAGMA foreign_keys = OFF")

        connection.execute("BEGIN")

        # 1. Create upgraded complaints table
        connection.execute("""
            CREATE TABLE complaints_new (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                tracking_id TEXT UNIQUE NOT NULL,

                user_id INTEGER,

                is_anonymous INTEGER NOT NULL DEFAULT 0
                    CHECK (is_anonymous IN (0, 1)),

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

        # 2. Preserve all existing complaints
        connection.execute("""
            INSERT INTO complaints_new (
                id,
                tracking_id,
                user_id,
                is_anonymous,
                title,
                description,
                category,
                location,
                image,
                priority,
                status,
                created_at
            )
            SELECT
                id,
                tracking_id,
                user_id,
                0,
                title,
                description,
                category,
                location,
                image,
                priority,
                status,
                created_at
            FROM complaints
        """)

        connection.execute("DROP TABLE complaints")

        connection.execute("""
            ALTER TABLE complaints_new
            RENAME TO complaints
        """)

        # 3. Rebuild complaint_updates
        # updated_by is now nullable for system events

        connection.execute("""
            CREATE TABLE complaint_updates_new (

                id INTEGER PRIMARY KEY AUTOINCREMENT,

                complaint_id INTEGER NOT NULL,

                old_status TEXT,

                new_status TEXT NOT NULL,

                updated_by INTEGER,

                remarks TEXT,

                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (complaint_id)
                    REFERENCES complaints(id)
                    ON DELETE CASCADE,

                FOREIGN KEY (updated_by)
                    REFERENCES users(id)
            )
        """)

        # 4. Preserve existing status history
        connection.execute("""
            INSERT INTO complaint_updates_new (
                id,
                complaint_id,
                old_status,
                new_status,
                updated_by,
                remarks,
                updated_at
            )
            SELECT
                id,
                complaint_id,
                old_status,
                new_status,
                updated_by,
                remarks,
                updated_at
            FROM complaint_updates
        """)

        connection.execute("DROP TABLE complaint_updates")

        connection.execute("""
            ALTER TABLE complaint_updates_new
            RENAME TO complaint_updates
        """)

        # 5. Add useful indexes
        connection.execute("""
            CREATE INDEX IF NOT EXISTS
            idx_complaints_user
            ON complaints(user_id)
        """)

        connection.execute("""
            CREATE INDEX IF NOT EXISTS
            idx_complaints_status
            ON complaints(status)
        """)

        connection.execute("""
            CREATE INDEX IF NOT EXISTS
            idx_complaints_category
            ON complaints(category)
        """)

        connection.commit()

        # Re-enable foreign keys
        connection.execute("PRAGMA foreign_keys = ON")

        # Verify foreign key integrity
        errors = connection.execute(
            "PRAGMA foreign_key_check"
        ).fetchall()

        if errors:
            print("WARNING: Foreign key errors:", errors)
        else:
            print("Foreign key integrity verified!")

        print("Anonymous reporting migration completed!")

    except Exception as error:

        connection.rollback()

        print("Migration failed:", error)
        print("Database transaction rolled back.")

    finally:
        connection.close()


if __name__ == "__main__":
    migrate_database()
