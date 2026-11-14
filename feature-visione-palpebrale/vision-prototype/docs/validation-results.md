# Validazione di misura e prestazioni — N05

Versione: **N05 — preparazione e collegamento**, aggiornata il 14 novembre 2026. Il documento raccoglie il
metodo, il protocollo e i risultati sintetici verificati. **La validazione
quantitativa con webcam e persone reali non è ancora stata eseguita**. T04/T05
sono disponibili; restano il caricamento effettivo del modello nel browser e le
prove reali annotate.

Le prove manuali senza annotazioni non vengono presentate come accuratezza. I
risultati sintetici verificano il metodo di confronto, non il comportamento
clinico o l'accuratezza della misura.

## 1 Scopo e perimetro

N05 confronta:

- eventi di chiusura annotati manualmente con le chiusure bilaterali del motore;
- copertura, tempo valido e quota di chiusura lette da `EngineSnapshot`;
- frequenza dei frame elaborati e latenza dell'inferenza.

Non rientrano in N05: diagnosi, percentuali di stanchezza, idoneità e accuratezza
clinica. T04 fornisce la sessione webcam; T06 esegue
il collaudo applicativo e offline.

## 2 Come funziona il confronto

Il codice è in `src/validation/`:

| Funzione | Scopo |
| --- | --- |
| `matchClosureEvents` | Confronto uno-a-uno fra annotazioni e chiusure bilaterali |
| `summarizeInferencePerformance` | Frequenza, media, minimo, massimo, p50 e p95 |
| `measureInference` | Misura di una singola elaborazione con orologio iniettabile |
| `createValidationReport` | Riepilogo JSON serializzabile senza ricalcolare il motore |

Un evento è candidato se:

- l'intersezione su unione (IoU) è almeno `minIou` (predefinito `0.5`), oppure
- inizio e fine rientrano in `startToleranceMs` / `endToleranceMs` (predefiniti
  `100 ms` ciascuno).

L'abbinamento è deterministico e uno-a-uno: prima IoU più alto, poi errori di
inizio/fine più piccoli. Il report distingue veri positivi, falsi positivi,
eventi mancati, differenze di completezza e scarti medi di inizio, fine e durata.

La frequenza è `(numero_frame - 1) / intervallo_totale`: descrive il passo dei
frame elaborati, non il frame rate dichiarato dalla fotocamera. I percentili
delle latenze usano interpolazione lineare.

## 3 Uso del harness

La sessione webcam misura automaticamente la latenza di `processFrame` durante
la misura e conserva i campioni nel JSON T05. Il pulsante **Esporta report N05**
produce un report di prestazioni `n05-session-v1` con configurazioni, profili,
provenienza e dispositivo. Senza annotazioni `comparison` e `annotations` sono
`null`: non vengono inventati falsi positivi o indicatori di accuratezza.

Un consumatore può chiamare `createSessionValidationReport(exported, annotations)`
passando annotazioni reali per ottenere il confronto N05. Un array vuoto passato
esplicitamente indica invece una sessione annotata senza eventi.

```ts
import { createValidationReport } from '../validation';
import { measureInference } from '../validation/performance';

const measured = measureInference(
  () => adapter.processFrame(frame, signal),
  () => performance.now(),
);

const report = createValidationReport({
  annotations,
  snapshot,
  performanceSamples,
  matching: { minIou: 0.5, startToleranceMs: 100, endToleranceMs: 100 },
});
```

`annotations` contiene intervalli `{ id, startMs, endMs, complete?, source? }`.
Le soglie di abbinamento vanno fissate **prima** di guardare i risultati e non
vanno cambiate per far coincidere un caso sfavorevole.

## 4 Esempi sintetici verificati

Questi valori vengono dai test in `tests/validation/` e verificano solo il
metodo di calcolo:

| Caso sintetico | Esito |
| --- | --- |
| Annotazione 100–300 ms, evento 100–300 ms | TP 1, precision 1, recall 1, errori 0 |
| Annotazione 100–300 ms, evento 400–500 ms | TP 0, FP 1, FN 1, precision 0, recall 0 |
| Annotazione 100–300 ms, evento 120–280 ms | IoU 0.8, errori inizio +20, fine −20, durata −40 |
| Evento completo atteso, evento incompleto prodotto | 1 differenza di completezza |
| 4 frame a 0/100/200/300 ms, latenze 10/20/30/40 ms | 10 fps, media 25 ms, p95 38.5 ms |
| Sessione sintetica 100–300 ms chiusa | coverage 1, closedMs 200, quota 2/3 |

Comandi:

```powershell
npm.cmd test -- tests/validation
```

## 5 Protocollo per la sessione reale

Da eseguire con T04/T05 disponibili, webcam e modello reale.

### 5.1 Ambiente da registrare

| Voce | Valore |
| --- | --- |
| Data e ora | da compilare |
| Macchina, CPU e RAM | da compilare |
| GPU / delegate (`CPU` o `GPU`) | da compilare |
| Browser e versione | da compilare |
| Runtime MediaPipe e versione | `@mediapipe/tasks-vision@1.2.3` |
| Modello e SHA-256 | `face_landmarker/float16/1`, `64184e22…0bc9ff` |
| Webcam, risoluzione e fps dichiarati | da compilare |
| Illuminazione e posizione | da compilare |
| `configId` motore/geometria/calibrazione | da compilare |
| `methodVersion` geometria | `n03-ear-v1` |

### 5.2 Annotazioni

Per ogni sessione:

1. registrare o rivedere il video con timestamp coerenti con quelli del pump;
2. annotare inizio e fine di ogni chiusura bilaterale;
3. indicare `complete` quando l'occhio si riapre con continuità;
4. classificare la fonte: `controlled`, `voluntary`, `spontaneous` o `fixture`;
5. conservare le note su occhiali, riflessi, rotazioni, uscita dall'inquadratura
   e interruzioni.

Senza annotazioni, la sessione è solo qualitativa e non produce precision,
recall o errore di durata.

### 5.3 Condizioni minime

| Prova | Cosa registrare |
| --- | --- |
| Base, volto frontale, luce uniforme | eventi annotati, copertura, latenze |
| Occhiali | riflessi, falsi positivi, eventi mancati |
| Controluce o luce bassa | perdita del volto, copertura, invalidità |
| Rotazione del capo | landmark mancanti, errori di inizio/fine |
| Uscita dall'inquadratura | invalidità, eventi incompleti, ripresa |
| Chiusure volontarie brevi e prolungate | durata, completezza, prolungati |
| Occhiolino | assenza di chiusure bilaterali |

Per le prestazioni raccogliere almeno un intervallo continuo di 30 secondi e
riportare `count`, `intervalMs`, `framesPerSecond`, `meanInferenceMs`,
`p50InferenceMs`, `p95InferenceMs`.

## 6 Risultati reali

Stato: **non ancora eseguiti**.

| Prova | Precision | Recall | Errori medi | Copertura | p50 / p95 inferenza |
| --- | --- | --- | --- | --- | --- |
| Base frontale | — | — | — | — | — |
| Occhiali | — | — | — | — | — |
| Luce bassa / controluce | — | — | — | — | — |
| Rotazione | — | — | — | — | — |
| Uscita dall'inquadratura | — | — | — | — | — |

Le celle vanno compilate solo con sessioni annotate e con configurazione,
macchina e versione registrate. I risultati parziali vanno etichettati come
tali.

## 7 Limiti

- Le misure sintetiche verificano il codice, non l'accuratezza su persone.
- Le annotazioni manuali possono essere imprecise e vanno conservate.
- Il modello, gli occhiali, i riflessi, la posa e l'illuminazione influenzano i
  landmark; N05 misura questi effetti, non li elimina.
- La latenza dipende da browser, hardware, delegate e risoluzione.
- Le misure descrivono il comportamento palpebrale osservato: non sono diagnosi,
  percentuali di stanchezza o giudizi di idoneità.
- La validazione quantitativa definitiva richiede prove annotate con gli asset
  locali caricati e un protocollo concordato con l'altro sviluppatore.
