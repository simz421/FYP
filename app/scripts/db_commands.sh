#!/bin/bash
# Database Migration Commands for Smart Farm NMS

case "$1" in
    init)
        echo "Initializing database migrations..."
        flask db init
        ;;
    
    migrate)
        echo "Creating migration..."
        flask db migrate -m "${2:-'Database changes'}"
        ;;
    
    upgrade)
        echo "Applying migrations..."
        flask db upgrade
        ;;
    
    downgrade)
        echo "Reverting last migration..."
        flask db downgrade
        ;;
    
    status)
        echo "Migration status:"
        flask db show
        ;;
    
    history)
        echo "Migration history:"
        flask db history
        ;;
    
    seed)
        echo "Seeding database with sample data..."
        python scripts/seed_database.py
        ;;
    
    backup)
        echo "Backing up database..."
        cp instance/nms.sqlite3 "instance/backup_$(date +%Y%m%d_%H%M%S).sqlite3"
        echo "Backup created"
        ;;
    
    *)
        echo "Usage: $0 {init|migrate|upgrade|downgrade|status|history|seed|backup}"
        echo ""
        echo "Commands:"
        echo "  init                   Initialize migration repository"
        echo "  migrate [message]      Create new migration"
        echo "  upgrade                Apply migrations"
        echo "  downgrade              Revert last migration"
        echo "  status                 Show migration status"
        echo "  history                Show migration history"
        echo "  seed                   Seed database with sample data"
        echo "  backup                 Backup database"
        exit 1
        ;;
esac