#!/bin/bash

###############################################################################
# SBCC Financial System - Database Backup Script
#
# Usage:
#   ./scripts/backup-database.sh [output_directory]
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

# Configuration
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
OUTPUT_DIR="${1:-./backups}"
BACKUP_FILE="${OUTPUT_DIR}/sbcc_backup_${TIMESTAMP}.sql"
COMPRESSED_FILE="${BACKUP_FILE}.gz"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}Error: DATABASE_URL environment variable is not set${NC}"
    echo "Please set it in your .env file or export it:"
    echo "  export DATABASE_URL='postgresql://user:pass@host/db'"
    exit 1
fi

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

echo -e "${YELLOW}Starting database backup...${NC}"
echo "Timestamp: $TIMESTAMP"
echo "Output directory: $OUTPUT_DIR"
echo ""

# Run pg_dump
echo -e "${YELLOW}Running pg_dump...${NC}"
if pg_dump "$DATABASE_URL" > "$BACKUP_FILE" 2>&1; then
    echo -e "${GREEN}✓ Database dump completed${NC}"
else
    echo -e "${RED}✗ Database dump failed${NC}"
    exit 1
fi

# Compress the backup
echo -e "${YELLOW}Compressing backup...${NC}"
if gzip "$BACKUP_FILE" 2>&1; then
    echo -e "${GREEN}✓ Backup compressed${NC}"
else
    echo -e "${RED}✗ Compression failed${NC}"
    exit 1
fi

# Get file size
FILE_SIZE=$(du -h "$COMPRESSED_FILE" | cut -f1)

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Backup completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo "File: $COMPRESSED_FILE"
echo "Size: $FILE_SIZE"
echo ""

# Clean up old backups (keep last 30 days)
echo -e "${YELLOW}Cleaning up old backups (keeping last 30 days)...${NC}"
find "$OUTPUT_DIR" -name "sbcc_backup_*.sql.gz" -type f -mtime +30 -delete 2>/dev/null || true
REMAINING_BACKUPS=$(find "$OUTPUT_DIR" -name "sbcc_backup_*.sql.gz" -type f | wc -l)
echo -e "${GREEN}✓ Cleanup complete. ${REMAINING_BACKUPS} backup(s) remaining${NC}"

echo ""
echo "To restore this backup, run:"
echo "  ./scripts/restore-database.sh $COMPRESSED_FILE"
