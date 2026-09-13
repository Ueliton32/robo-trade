#!/usr/bin/env python3
"""
shadow-comparison-cron.py — Roda shadow-comparison.ts diariamente via cron Hermes
Agendado para execução automática a cada dia às 9h (horário de Brasília).

Em vez de bash, usa Python diretamente (compatível com Windows sem Git Bash).
"""

import os
import subprocess
import shutil
import glob
from datetime import datetime
from pathlib import Path

# Diretório do projeto
PROJECT_DIR = r"C:\Users\ueliton.filho\Documents\Projetos\Projeto Claude\robo_trade\nextjs_space"
LOG_DIR = Path(PROJECT_DIR) / "scripts" / "shadow-results"
SCRIPT_PATH = Path(PROJECT_DIR) / "scripts" / "shadow-comparison.ts"
NODE_MODULES = Path(PROJECT_DIR) / "node_modules"
TSX_PATH = NODE_MODULES / ".bin" / "tsx.cmd"  # Windows

def main():
    # Garante que a pasta de logs existe
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    log_file = LOG_DIR / f"shadow-comparison-{timestamp}.log"

    with open(log_file, "w", encoding="utf-8") as f:
        f.write(f"=== shadow-comparison run: {timestamp} ===\n\n")

        # Descobre o caminho do tsx — prefer .cmd no Windows
        if TSX_PATH.exists():
            tsx = str(TSX_PATH)
        else:
            # fallback: npx tsx
            tsx = "npx"
            args = ["tsx", "--require", "dotenv/config", str(SCRIPT_PATH)]
            cmd = [tsx] + args
        if TSX_PATH.exists():
            cmd = [tsx, "--require", "dotenv/config", str(SCRIPT_PATH)]
        else:
            cmd = ["npx", "tsx", "--require", "dotenv/config", str(SCRIPT_PATH)]

        # Roda e captura output
        try:
            result = subprocess.run(
                cmd,
                cwd=PROJECT_DIR,
                capture_output=True,
                text=True,
                timeout=300,  # 5 minutos
            )
            f.write(result.stdout)
            if result.stderr:
                f.write("\n--- STDERR ---\n")
                f.write(result.stderr)
            f.write(f"\n=== Finished with exit code: {result.returncode} ===\n")
        except subprocess.TimeoutExpired:
            f.write("=== TIMEOUT: script took longer than 5 minutes ===\n")
        except Exception as e:
            f.write(f"=== ERROR: {e} ===\n")

    # Rota logs antigos (mantém últimos 30)
    logs = sorted(LOG_DIR.glob("shadow-comparison-*.log"), key=lambda p: p.stat().st_mtime, reverse=True)
    for old_log in logs[30:]:
        old_log.unlink()

    # Re-escreve o log com o conteúdo final (após rotação)
    with open(log_file, "r", encoding="utf-8") as f:
        content = f.read()
    with open(log_file, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"Log salvo em: {log_file}")
    return 0

if __name__ == "__main__":
    exit(main())