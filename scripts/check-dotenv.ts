/**
 * Verifica se o dotenv está carregando EXECUTION_MODE=SHADOW
 */

import 'dotenv/config';
import { getConfiguredExecutionMode } from '@/lib/execution-mode';

console.log('EXECUTION_MODE do process.env:', process.env.EXECUTION_MODE);
console.log('Modo configurado pelo sistema:', getConfiguredExecutionMode());
console.log('shadow_evaluation_ativo:', process.env.EXECUTION_MODE?.trim().toUpperCase() === 'SHADOW' ? '✅ SIM' : '❌ NÃO');
