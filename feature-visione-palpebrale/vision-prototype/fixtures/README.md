# Fixture N01/N02

Le sequenze sono definite in `sequences.ts` e sono tipizzate con
`ReplayFixture`. Ogni fixture dichiara:

- `config`: parametri usati dal motore;
- `samples`: campioni già calibrati, con timestamp in millisecondi;
- `stopAfterSamples`: se la sessione viene arrestata al termine;
- `expected`: sottoinsieme dell'istantanea finale verificato dai test.

Per riprodurne una senza webcam:

```ts
import { replayFixture } from '../src/analysis/replay';
import { shortClosures } from '../fixtures';

const { snapshot } = replayFixture(shortClosures);
```

I test in `tests/analysis/fixtures.test.ts` confrontano `expected` con
`snapshot`; nessun test usa DOM, React, rete o timestamp di sistema.

## Configurazione comune

Salvo diversa indicazione:

| Parametro | Valore |
| --- | --- |
| `closedEnter` | 0.25 |
| `openExit` | 0.4 |
| `maxGapMs` | 250 |
| `rollingWindowMs` | 10000 |
| `prolongedClosureMs` | 500 |

Valori aperti usati nelle sequenze: `0.9`; chiusi: `0.1`; banda di isteresi:
`0.3` e `0.35`.

## Casi e risultati attesi

Tempi in millisecondi. `valid` e `closed` sono bilaterali salvo notazione.

| Fixture | Scenario | Risultato atteso principale |
| --- | --- | --- |
| `open-baseline` | Entrambi gli occhi aperti per 400 ms | `valid = 400`, `closed = 0`, `coverage = 1`, nessun evento |
| `short-closures` | Due chiusure bilaterali brevi | `elapsed = 700`, `valid = 700`, `closed = 300`, 2 eventi completi da 200 e 100 ms |
| `prolonged-closure` | Una chiusura di 800 ms | `closed = 800`, 1 evento completo prolungato, massima completa 800 |
| `wink` | Un occhio chiuso per 200 ms, l'altro aperto | Chiusura bilaterale `0`; evento sinistro completo da 200 ms |
| `tracking-loss` | Occhi non valutabili durante la chiusura | `valid = 500`, `closed = 200`, 1 evento incompleto `tracking_lost` da 200 ms |
| `time-gap` | Intervallo di 700 ms oltre `maxGapMs` | `gap = 700`, `valid = 400`, `closed = 100`, evento incompleto `gap` da 100 ms |
| `null-valid-time` | Tutti i campioni invalidi | `valid = 0`, `coverage = 0`, `closureFraction = null`, nessun evento |
| `duplicate-out-of-order` | Timestamp duplicato e fuori ordine | 4 accettati, 2 rifiutati; la misura resta `valid = 300`, `closed = 100` |
| `stop-during-closure` | Arresto mentre entrambi gli occhi sono chiusi | Stato `stopped`; chiusura incompleta `stopped` da 100 ms, non prolungata |
| `calibration-change` | Cambio da `cal-a` a `cal-b` durante la chiusura | Transizione 100 ms; 1 evento incompleto `calibration_changed` e 1 completo da 200 ms |
| `hysteresis` | Valori intermedi nella banda | Nessuna oscillazione; eventi completi da 300 e 100 ms, `closed = 400` |
| `rolling-window` | Finestra mobile di 500 ms su chiusura iniziata prima | Sessione: evento completo da 600 ms. Finestra `[500, 1000]`: sovrapposizione 200 ms, `completeWithinWindow = false`, nessuna chiusura completa |

## Note sui risultati

- Gli eventi hanno identificativi deterministici per tipo: `left-N`, `right-N`,
  `bilateral-N`.
- Un `endedAtMs: null` indica un evento ancora in corso nell'istantanea.
- La fixture `rolling-window` verifica che un evento tagliato dal bordo non
  diventi una chiusura completa più breve: `durationMs` resta 600, mentre
  `windowOverlapMs` vale 200 e `completeWithinWindow` è falso.
- `null-valid-time` dimostra la differenza tra `coverage = 0` (periodo osservato
  senza dati validi) e `closureFraction = null` (nessun tempo valido su cui
  calcolare la quota).
