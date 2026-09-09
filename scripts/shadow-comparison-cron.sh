#!/usr/bin/env bash
# shadow-comparison-cron.sh — Roda shadow-comparison.ts diariamente
# Agendado via Hermes cronjob para execução automática

set -e

SCRIPT_DIR="/c/Users/ueliton.filho/Documents/Projetos/Projeto Claude/robo_trade/nextjs_space"
cd "$SCRIPT_DIR"

LOG_DIR="$SCRIPT_DIR/scripts/shadow-results"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_FILE="$LOG_DIR/shadow-comparison-$TIMESTAMP.log"

echo "=== shadow-comparison run: $TIMESTAMP ===" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

npx tsx --require dotenv/config scripts/shadow-comparison.ts >> "$LOG_FILE" 2>&1

EXIT_CODE=$?
echo "" >> "$LOG_FILE"
echo "=== Finished with exit code: $EXIT_CODE ===" >> "$LOG_FILE"

# Manter apenas últimos 30 logs
cd "$LOG_DIR"
ls -t shadow-comparison-*.log | tail -n +31 | xargs -r rm --

exit $EXIT_CODE