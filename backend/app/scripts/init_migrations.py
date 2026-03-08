#!/usr/bin/env python3
"""
Initialize database migrations for Smart Farm NMS
Run: python scripts/init_migrations.py
"""
import os
import sys
from pathlib import Path

# Add app to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app import create_app
from app.extensions import db

app = create_app()

with app.app_context():
    # Create tables if they don't exist
    print("📊 Creating database tables...")
    db.create_all()
    
    # Create initial migration if needed
    migration_dir = Path("migrations")
    if not migration_dir.exists():
        print("🚀 Initializing database migrations...")
        os.system("flask db init")
        os.system("flask db migrate -m 'Initial database schema'")
        os.system("flask db upgrade")
        print("✅ Migrations initialized successfully!")
    else:
        print("✅ Migrations already initialized.")
    
    # Verify database
    from app.models import Node, SensorReading
    node_count = Node.query.count()
    reading_count = SensorReading.query.count()
    
    print(f"\n📈 Database Status:")
    print(f"   - Tables created: ✓")
    print(f"   - Nodes in DB: {node_count}")
    print(f"   - Readings in DB: {reading_count}")
    print(f"\n🔧 Migration Commands:")
    print(f"   flask db migrate -m 'Description of changes'")
    print(f"   flask db upgrade")
    print(f"   flask db downgrade  # Rollback one migration")