import subprocess, sys
from pathlib import Path

PROJECT = Path(r'C:\Users\ueliton.filho\Documents\Projetos\Projeto Claude\robo_trade\nextjs_space')
cmd = 'npm run monitoring:daily'
result = subprocess.run(cmd, cwd=PROJECT, text=True, capture_output=True, shell=True)
if result.stdout:
    print(result.stdout)
if result.stderr:
    print(result.stderr, file=sys.stderr)
sys.exit(result.returncode)
