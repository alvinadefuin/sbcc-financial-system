#!/bin/bash

###############################################################################
# SBCC Financial System - Database Restore Script
#
# Usage:
#   ./scripts/restore-database.sh <backup_file.sql.gz>
#
# Environment Variables Required:
#   DATABASE_URL - PostgreSQL connection string for Neon DB
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if backup file is provided
if [ -z "$1" ]; then
    echo -e "${RED}Error: No backup file specified${NC}"
    echo "Usage: $0 <backup_file.sql.gz>"
    echo ""
    echo "Available backups:"
    find ./backups -name "sbcc_backup_*.sql.gz" -type f -exec basename {} \; 2>/dev/null || echo "  No backups found"
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: Backup file not found: $BACKUP_FILE${NC}"
    exit 1
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}Error: DATABASE_URL environment variable is not set${NC}"
    echo "Please set it in your .env file or export it:"
    echo "  export DATABASE_URL='postgresql://user:pass@host/db'"
    exit 1
fi

echo -e "${RED}========================================${NC}"
echo -e "${RED}WARNING: DATABASE RESTORE${NC}"
echo -e "${RED}========================================${NC}"
echo "This will REPLACE ALL DATA in the database with the backup:"
echo "  File: $BACKUP_FILE"
echo "  Database: $DATABASE_URL"
echo ""
echo -e "${YELLOW}THIS ACTION CANNOT BE UNDONE!${NC}"
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# Create a safety backup before restore
SAFETY_BACKUP="./backups/pre-restore_$(date +%Y-%m-%d_%H-%M-%S).sql.gz"
echo ""
echo -e "${YELLOW}Creating safety backup before restore...${NC}"
pg_dump "$DATABASE_URL" | gzip > "$SAFETY_BACKUP"
echo -e "${GREEN}✓ Safety backup created: $SAFETY_BACKUP${NC}"

# Decompress if needed
TEMP_SQL_FILE="/tmp/sbcc_restore_temp.sql"
if [[ "$BACKUP_FILE" == *.gz ]]; then
    echo -e "${YELLOW}Decompressing backup file...${NC}"
    gunzip -c "$BACKUP_FILE" > "$TEMP_SQL_FILE"
else
    cp "$BACKUP_FILE" "$TEMP_SQL_FILE"
fi

echo -e "${YELLOW}Restoring database...${NC}"

# Drop existing connections (optional, may require superuser)
# psql "$DATABASE_URL" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();" || true

# Restore the database
if psql "$DATABASE_URL" < "$TEMP_SQL_FILE" 2>&1; then
    echo -e "${GREEN}✓ Database restore completed${NC}"
else
    echo -e "${RED}✗ Database restore failed${NC}"
    echo ""
    echo "You can restore from the safety backup:"
    echo "  ./scripts/restore-database.sh $SAFETY_BACKUP"
    rm -f "$TEMP_SQL_FILE"
    exit 1
fi

# Cleanup temp file
rm -f "$TEMP_SQL_FILE"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Restore completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo "Safety backup location: $SAFETY_BACKUP"
echo ""
echo "Next steps:"
echo "  1. Verify the data in your application"
echo "  2. Test critical functionality"
echo "  3. If issues arise, restore from safety backup"
