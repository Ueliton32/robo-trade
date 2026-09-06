// Versão do robô — gravada em cada sinal novo (Signal.robotVersion) pra
// permitir comparar resultados de sinais gerados por versões diferentes da
// lógica de decisão. Bump manual: suba esse valor sempre que mudar algo
// que afete COMO um sinal é decidido (uma estratégia, o filtro de regime
// ao vivo, os multiplicadores de stop/leverage por tier) — não precisa
// subir por mudança de UI, texto, ou refactor sem efeito na decisão.
//
// Formato livre (não é semver estrito) — o que importa é ser único por
// mudança relevante, pra dar pra filtrar "sinais gerados pela versão X" no
// banco depois.
export const ROBOT_VERSION = '2026.09.04-fase2-registro';
