import type {
  EngineConfigInput,
  EngineConfigValues,
  ResolvedEngineConfig,
} from '../contracts/engine';

/**
 * Valori iniziali sperimentali.
 *
 * Le soglie descrivono l'apertura normalizzata, non una percentuale clinica.
 * Il collaudo N05 deve motivare o sostituire questi valori.
 */
export const DEFAULT_ENGINE_CONFIG: Readonly<EngineConfigValues> = Object.freeze({
  closedEnter: 0.25,
  openExit: 0.4,
  maxGapMs: 250,
  rollingWindowMs: 10_000,
  prolongedClosureMs: 500,
});

export const DEFAULT_CONFIG_VERSION = 'n02-config-v1';

export class EngineConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Configurazione del motore non valida: ${issues.join('; ')}`);
    this.name = 'EngineConfigError';
    this.issues = Object.freeze([...issues]);
  }
}

function numberOr(value: number | undefined, fallback: number): number {
  return value === undefined ? fallback : value;
}

/**
 * Valida la configurazione e ne calcola l'identificativo dei valori usati.
 * Lancia `EngineConfigError` se un parametro è fuori intervallo.
 */
export function resolveEngineConfig(
  input: EngineConfigInput = {},
): ResolvedEngineConfig {
  const values: EngineConfigValues = {
    closedEnter: numberOr(input.closedEnter, DEFAULT_ENGINE_CONFIG.closedEnter),
    openExit: numberOr(input.openExit, DEFAULT_ENGINE_CONFIG.openExit),
    maxGapMs: numberOr(input.maxGapMs, DEFAULT_ENGINE_CONFIG.maxGapMs),
    rollingWindowMs: numberOr(input.rollingWindowMs, DEFAULT_ENGINE_CONFIG.rollingWindowMs),
    prolongedClosureMs: numberOr(
      input.prolongedClosureMs,
      DEFAULT_ENGINE_CONFIG.prolongedClosureMs,
    ),
  };

  const version = input.version === undefined ? DEFAULT_CONFIG_VERSION : input.version.trim();
  const issues: string[] = [];

  if (!Number.isFinite(values.closedEnter) || values.closedEnter < 0 || values.closedEnter >= 1) {
    issues.push('closedEnter deve essere finito e compreso tra 0 e 1, escluso 1');
  }
  if (!Number.isFinite(values.openExit) || values.openExit <= values.closedEnter || values.openExit > 1) {
    issues.push('openExit deve essere finito e maggiore di closedEnter, al massimo 1');
  }
  if (!Number.isFinite(values.maxGapMs) || values.maxGapMs <= 0) {
    issues.push('maxGapMs deve essere finito e maggiore di 0');
  }
  if (!Number.isFinite(values.rollingWindowMs) || values.rollingWindowMs <= 0) {
    issues.push('rollingWindowMs deve essere finito e maggiore di 0');
  }
  if (!Number.isFinite(values.prolongedClosureMs) || values.prolongedClosureMs <= 0) {
    issues.push('prolongedClosureMs deve essere finito e maggiore di 0');
  }
  if (version.length === 0) {
    issues.push('version non può essere vuota');
  }

  if (issues.length > 0) {
    throw new EngineConfigError(issues);
  }

  const configId = [
    version,
    `closedEnter=${values.closedEnter}`,
    `openExit=${values.openExit}`,
    `maxGapMs=${values.maxGapMs}`,
    `rollingWindowMs=${values.rollingWindowMs}`,
    `prolongedClosureMs=${values.prolongedClosureMs}`,
  ].join('|');

  return Object.freeze({ version, ...values, configId });
}
