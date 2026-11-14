/** Limiti condivisi fra acquisizione, serializzazione e validazione dei file. */
export const MAX_SESSION_SAMPLES = 18_000;
export const MAX_CHART_POINTS = 2_000;
/** L'ultimo frame può essere misurato prima di un errore o di un'interruzione. */
export const MAX_PERFORMANCE_SAMPLES = MAX_SESSION_SAMPLES + 1;
