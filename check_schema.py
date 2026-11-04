import sqlite3

connection = sqlite3.connect(
    "backend/database/campusfix.db"
)

cursor = connection.cursor()

cursor.execute("""
    PRAGMA table_info(complaints)
""")

print("COMPLAINTS TABLE")

for column in cursor.fetchall():
    print(column)

cursor.execute("""
    PRAGMA table_info(complaint_updates)
""")

print("\nCOMPLAINT UPDATES TABLE")

for column in cursor.fetchall():
    print(column)

connection.close()