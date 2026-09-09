#!/usr/bin/env python3
"""
Verifica se EXECUTION_MODE está configurado como SHADOW e se o
sistema está lendo corretamente a variável de ambiente.
"""

import os
import sys

# Emulação do getConfiguredExecutionMode do execution-mode.ts
def getConfiguredExecutionMode():
    raw = (os.environ.get('EXECUTION_MODE') or 'PAPER_TRADING').strip().upper()
    valid_modes = ['PAPER_TRADING', 'SHADOW', 'LIVE']
    return raw if raw in valid_modes else 'PAPER_TRADING'

mode = getConfiguredExecutionMode()
print(f"EXECUTION_MODE lido: {mode}")
print(f"Somente leitura (sem conexão banco): ✅" if mode == 'SHADOW' else "⚠ Não está SHADOW")
