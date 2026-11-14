import type { AnalysisSample } from './sample';
import type { EngineConfigInput, EngineSnapshot } from './engine';

/** Sottoinsieme ricorsivo usato dalle aspettative delle fixture. */
export type DeepPartial<T> = T extends readonly (infer U)[]
  ? readonly DeepPartial<U>[]
  : T extends object
    ? { readonly [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type FixtureExpectation = DeepPartial<EngineSnapshot>;

/**
 * Sequenza sintetica riproducibile senza webcam.
 *
 * I campioni descrivono direttamente l'uscita del futuro adattatore di
 * calibrazione, quindi il replay non richiede DOM, React o rete.
 * `expected` è un sottoinsieme dell'istantanea finale confrontato dai test.
 */
export interface ReplayFixture {
  readonly fixtureVersion: 'n02-fixture-v1';
  readonly name: string;
  readonly description: string;
  readonly config: EngineConfigInput;
  readonly samples: readonly AnalysisSample[];
  readonly stopAfterSamples?: boolean;
  readonly expected: FixtureExpectation;
}
