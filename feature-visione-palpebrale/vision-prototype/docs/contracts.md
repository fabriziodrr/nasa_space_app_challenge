# Contratti condivisi e semantica temporale

Contratto corrente: **c01-v2**, 14 novembre 2026, revisione di c01-v1. La
revisione aggiunge `sample_limit`, `unstable_reference` e i dettagli dei motivi;
N02, N03, N04, la UI e l'esportazione sono aggiornati insieme. C01 v1 era stato
stabilito il 13 novembre 2026 sulla base della proposta N01/N02.
`src/contracts/version.ts` espone `CONTRACT_VERSION`. I formati già prodotti da
N02 conservano `n02-snapshot-v1`, `n02-engine-v1` e `n02-fixture-v1`: C01 non ne
rinomina i campi. Cambiamenti incompatibili successivi richiedono una nuova
versione e l'aggiornamento esplicito di produttori, consumatori e fixture.

Il motore temporale è TypeScript puro: non importa DOM, React, webcam, rete o
runtime di inferenza. Riceve `AnalysisSample` e produce `EngineSnapshot`.
Il codice di riferimento è in `src/contracts/` e `src/analysis/`.

## 1 Unità, valori e `null`

| Concetto | Unità / intervallo | Significato |
| --- | --- | --- |
| Tempo | millisecondi, numero finito | Stessa origine per tutti i campioni di una sessione; deve essere monotono |
| `openness` | numero finito, normalmente 0–1 | 0 = riferimento chiuso, 1 = riferimento aperto; il motore non taglia i valori fuori intervallo |
| Soglie | 0–1 | `closedEnter` < `openExit`; l'intervallo intermedio è la banda di isteresi |
| Durate | millisecondi | Somme di intervalli fra campioni accettati |
| Coperture e quote | numero o `null` | `null` quando il denominatore è zero |
| Motivi e stati | stringhe enumerabili | I codici sono stabili; l'interfaccia può tradurli in messaggi |
| Eventi in corso | `endedAtMs: null` | La durata osservata arriva all'ultimo campione, non all'istante della chiamata |

Un occhio non valutabile non ha un numero: `openness` non è `0`, perché `0`
significa chiuso con continuità e non dato mancante. Allo stesso modo una
copertura `0` indica tempo osservato senza dati validi, mentre `null` indica che
non c'è ancora un intervallo temporale su cui calcolarla.

## 2 Fotogramma in ingresso all'inferenza

`src/contracts/frame.ts` definisce `InferenceFrame`:

- `frameId` intero positivo crescente per istanza di acquisizione, `timestampMs`
  finito e non negativo, `width` e `height` interi positivi;
- `pixels` in formato `rgba8`, sRGB, righe dall'alto verso il basso, canali
  R/G/B/A contigui, quattro byte per pixel e nessun padding. `data` è una
  `Uint8ClampedArray<ArrayBuffer>` di esattamente `width * height * 4` elementi,
  con offset zero e buffer dedicato, senza alias con immagini successive;
- `source` distingue `webcam` e `synthetic`;
- `release()` è responsabilità del consumatore, che la chiama esattamente una
  volta anche in caso di errore;
- il produttore mantiene valido il buffer fino alla chiamata di `release`;
- dopo `release()` non si leggono né si trasferiscono più i pixel; il rilascio
  è idempotente per proteggere le vie di errore;
- `timestampMs` è monotono e in millisecondi: per la webcam è il tempo del
  callback, rispetto a `performance.timeOrigin`, non l'istante del sensore.

`Uint8ClampedArray` e `ArrayBuffer` sono disponibili sia nella pagina sia in un
Web Worker. Il contratto permette quindi di trasferire `pixels.data.buffer`, ma
non impone il Worker e non viene importato dal motore temporale.

Il consumatore usa `InferenceFrameConsumer(frame, signal)` e termina la propria
Promise solo dopo aver finito di usare i pixel. Deve rilasciarli in un `finally`
e ignorare risultati se il segnale è annullato. Una sola elaborazione alla volta,
nessuna coda e nessuna ricostruzione dei frame saltati, anche fra stop e riavvio.
Lo stop annulla il lavoro ma non libera buffer ancora in uso: il consumatore deve
concludere o gestire l'annullamento.

La webcam usa `src/capture/inference-frame-adapter.ts`: copia il video originale
in un canvas locale prima del primo `await`, produce RGBA e garantisce il cleanup
anche per consumatori fallibili. Lo specchio CSS non viene applicato ai pixel.
Il canvas viene creato solo se si collega un consumatore: l'anteprima da sola
non copia immagini. La struttura `CapturedVideoFrame` resta un dettaglio interno.

Per un Worker si trasferiscono soltanto metadati e `pixels.data.buffer`, non
`release`, `signal` o l'intero oggetto con funzioni. L'adattatore principale
propaga l'annullamento, attende la conferma di fine elaborazione e chiama
`release()`. Il Worker restituisce lo stesso `timestampMs` ricevuto, senza usare
un proprio orologio. Il percorso iniziale N04 esegue nella pagina; il Worker è
opzionale e il percorso compatibile è documentato in `docs/inference.md`.

L'adattatore N04 consuma questo `InferenceFrame` RGBA e produce
`FaceInferenceResult` con stato `face`, `no_face`, `ambiguous` o
`invalid_landmarks`. Il risultato contiene sempre `FaceGeometryObservation`; un
volto assente non diventa occhi aperti. Errori di configurazione, caricamento,
frame o runtime sono espliciti tramite `InferenceError.code`. Dettagli e
provenienza in `docs/inference.md`.

## 3 Campione per il motore

`src/contracts/sample.ts` definisce `AnalysisSample`:

```ts
interface AnalysisSample {
  timestampMs: number;
  calibrationId: string;
  left: EyeObservation;
  right: EyeObservation;
}

type EyeObservation =
  | { validity: 'valid'; openness: number }
  | { validity: 'invalid'; reasons: readonly [EyeInvalidityReason, ...EyeInvalidityReason[]] };
```

Regole:

- `timestampMs` finito e non negativo; il motore rifiuta duplicati e valori
  decrescenti;
- `calibrationId` stringa non vuota e non composta solo da spazi;
- `openness` finita e già normalizzata con la calibrazione indicata;
- un occhio `invalid` deve avere uno o più motivi, ma nessun `openness`, nemmeno
  zero. Il motore rifiuta anche le violazioni rilevate a runtime.

Motivi condivisi da `EYE_INVALIDITY_REASONS`: `not_tracked`, `landmark_missing`,
`low_confidence`, `geometry_invalid`, `out_of_range`, `ambiguous_face`,
`uncalibrated`, `unknown`. `ambiguous_face` indica più volti e viene accettato
dal motore come osservazione non valutabile.

La geometria grezza prima della calibrazione è descritta in
`src/contracts/geometry.ts`:

- `FaceLandmarks` contiene i sei punti per occhio, dimensioni dell'immagine e
  spazio delle coordinate (`normalized` o `pixels`);
- `EyeGeometryObservation` espone `eyeAspectRatio`, larghezza orizzontale in
  pixel, validità e motivi;
- `FaceGeometryObservation` conserva timestamp, `methodVersion` e i due occhi.

La formula è EAR, calcolata in pixel dopo la conversione delle coordinate
normalizzate. Punti, correzione delle scale e controlli di ammissibilità sono
descritti in `docs/measurement-method.md`; il motore temporale legge solo
`openness`.

Per la geometria valida `eyeAspectRatio` è un numero finito non negativo,
adimensionale, senza un massimo universale. La formula N03 deve correggere le
scale usando le dimensioni reali dell'immagine prima dei rapporti di distanze.
Il set di punti e i controlli geometrici sono documentati da N03; `methodVersion`
identifica il metodo, mentre la configurazione ne conserva le soglie. Non si
inventa una conversione nella UI. La geometria invalida
usa `valid: false`, almeno un motivo e nessun `eyeAspectRatio`.

`left` e `right` indicano i lati della persona ripresa, indipendentemente dallo
specchio dell'anteprima. I produttori non modificano né riusano i campioni dopo
la consegna al motore. Per mostrare i motivi di invalidità, la UI conserva l'ultimo
campione accettato in `ApplicationSessionSnapshot.lastSample`; gli aggregati e gli
stati oculari provengono sempre da `EngineSnapshot`.

## 4 Calibrazione

`src/contracts/calibration.ts` definisce:

- `CalibrationConfigValues`: campioni richiesti per occhio e fase, scostamento
  massimo dalla mediana e separazione minima;
- `CalibrationProgress`: stato tecnico, fase attiva e avanzamento per occhio;
- `CalibrationOutcome`: esito per occhio, motivi dettagliati, profilo o `null`;
- `CalibrationState`: stato applicativo C01 derivato con `toCalibrationState`;
- `CalibrationProfile` e `EyeCalibrationReferences`.

Nel profilo:

- `id` distingue una specifica raccolta di riferimenti;
- `version` identifica formula e procedura;
- `methodVersion` deve coincidere con la geometria usata per i campioni;
- `open`, `closed` e `minimumSeparation` sono nella geometria grezza di N03;
- `normalization: 'open-closed-v1'` descrive la normalizzazione usata per
  produrre `openness`.

I riferimenti devono essere finiti, non negativi, con `open > closed`,
`minimumSeparation > 0` e `open - closed >= minimumSeparation`, per entrambi gli
occhi. La normalizzazione è `(valore - closed) / (open - closed)`, senza clipping.
`capturedAtMs` è una data UTC in millisecondi Unix: è metadato e non entra nei
calcoli temporali. Prima di una calibrazione valida non si avvia la misura webcam.

`CalibrationState` definisce `idle`, `collecting`, `ready` e `insufficient`.
Durante la raccolta, `reference` distingue `open` e `closed`; `acceptedSamples`
conta separatamente i due occhi nel riferimento corrente e
`requiredSamplesPerEye` dichiara l'obiettivo intero positivo. N03 sceglie e registra
il numero sperimentale e l'algoritmo di raccolta; soltanto dati geometricamente
validi incrementano i contatori. I motivi applicativi di fallimento sono `insufficient_samples`,
`insufficient_separation`, `invalid_geometry`, `unstable_reference` e `interrupted`.

N03 conserva anche i motivi dettagliati `CalibrationEyeFailureReason`:
`not_enough_open_samples`, `not_enough_closed_samples`, `unstable_open`,
`unstable_closed`, `separation_too_small`. `toCalibrationState(progress, outcome)`
traduce campioni insufficienti in `insufficient_samples`, separazione ridotta in
`insufficient_separation` e riferimenti instabili in `unstable_reference`.
I motivi N03 originali sono conservati in `details`; `interrupted` distingue
una raccolta interrotta da dati insufficienti. Lo stato tecnico `ready` indica
soltanto che la raccolta è sufficiente: lo stato C01 diventa `ready` soltanto
dopo `finish()` riuscito, con un profilo completo. Il profilo conserva il metodo
effettivamente raccolto; mescolare metodi o usare un profilo su un metodo diverso
produce `CalibrationStateError` e richiede una nuova calibrazione.

Un nuovo avvio della webcam, un cambio sorgente, metodo/modello, risoluzione,
ritaglio o procedura di normalizzazione, una sospensione o un errore di acquisizione
invalidano i riferimenti per le misure successive. Occorre una nuova calibrazione.
Una perdita di tracciamento o un gap nella stessa acquisizione interrompono gli
eventi, senza invalidare automaticamente i riferimenti se il contesto è invariato.
La UI non presenta mai una vecchia calibrazione come automaticamente valida.

Il motore non ricalcola la calibrazione: usa `calibrationId` soltanto per
verificare la continuità. Un cambio di identificativo interrompe la misura e
chiude come incompleti gli episodi in corso. La procedura è in
`docs/calibration.md`.

## 5 API del motore

`TemporalEngine` in `src/analysis/engine.ts`:

```ts
new TemporalEngine(config?)
start(): void
processSample(sample: AnalysisSample): ProcessSampleResult
getSnapshot(): EngineSnapshot
stop(): void
reset(): void
```

- `start()` azzera la sessione e porta lo stato a `running`;
- `processSample()` è valido solo in `running`; altrimenti lancia
  `EngineStateError`, che segnala un errore d'uso, non un campione rifiutato;
- un campione malformato o non monotono restituisce
  `{ status: 'rejected', reason, message }` e non modifica la misura;
- `getSnapshot()` è immutabile e non ha effetti collaterali;
- `stop()` chiude gli episodi aperti come incompleti con motivo `stopped` e non
  estende la durata fino all'istante della chiamata;
- `reset()` torna a `idle` e cancella ogni risultato.

Un campione rifiutato aggiorna solo diagnostica e contatori di rifiuto; non
modifica le misure o l'ultimo campione accettato. La UI e l'esportazione consumano
la stessa istantanea, senza duplicare il calcolo delle metriche.

Motivi di rifiuto: `invalid_timestamp`, `duplicate_timestamp`,
`out_of_order_timestamp`, `invalid_calibration_id`,
`invalid_eye_observation`.

## 6 Isteresi per occhio

Per ogni occhio il motore mantiene lo stato `unknown`, `open` o `closed`.

- da `open` o `unknown`: diventa `closed` se `openness <= closedEnter`;
- da `closed`: torna `open` se `openness >= openExit`;
- nella banda intermedia lo stato precedente resta invariato.

Un campione valido porta sempre l'occhio a `open` o `closed`. Un campione
invalido porta l'occhio a `unknown` e chiude come incompleto un eventuale
episodio in corso.

Lo stato bilaterale è:

| Stato | Condizione |
| --- | --- |
| `closed` | entrambi gli occhi valutabili e chiusi |
| `open` | entrambi gli occhi valutabili e aperti |
| `mixed` | entrambi valutabili, uno aperto e uno chiuso: occhiolino |
| `unknown` | almeno un occhio non valutabile |

Solo `closed` genera un episodio bilaterale. `mixed` non è una chiusura
bilaterale.

## 7 Attribuzione del tempo

La politica è **sample-and-hold**: lo stato calcolato su un campione si applica
all'intervallo fino al campione successivo, cioè `[t_i, t_{i+1})`.

- L'ultimo campione non aggiunge durata oltre sé stesso.
- Un intervallo `<= maxGapMs` fra due campioni accettati entra nel tempo
  osservato.
- Un intervallo `> maxGapMs` è un **gap**: non entra né nel tempo valido né nel
  tempo chiuso, interrompe la continuità e chiude gli episodi aperti come
  incompleti con motivo `gap`.
- Un cambio di `calibrationId` rende l'intervallo una transizione di
  calibrazione: non entra nel tempo valido, interrompe la continuità e chiude gli
  episodi con motivo `calibration_changed`.
- Un campione invalido non contribuisce all'intervallo successivo; l'intervallo
  precedente resta attribuito all'ultimo stato valido. L'episodio in corso viene
  chiuso all'istante del campione invalido con motivo `tracking_lost`.
- Duplicati e timestamp fuori ordine vengono rifiutati senza modificare stato,
  durate o contatori.

Nessun tempo mancante viene ricostruito come chiusura certa. Gap e transizioni
di calibrazione restano visibili in `gapMs` e `calibrationTransitionMs` e sono
inclusi in `unknownMs = elapsedMs - validMs`.

## 8 Eventi

Un episodio è registrato separatamente per occhio sinistro, occhio destro e
coppia bilaterale. Ogni evento ha:

- `id` deterministico nel formato `left-N`, `right-N`, `bilateral-N`;
- `startedAtMs`, `endedAtMs`, `durationMs`;
- `complete` e `endedReason`;
- `prolonged`, vero solo per eventi completi con durata almeno
  `prolongedClosureMs`.

Cause di fine:

| `endedReason` | Evento completo | Significato |
| --- | --- | --- |
| `reopened` | sì | L'occhio o la coppia si è riaperta con continuità |
| `tracking_lost` | no | Un occhio non è più valutabile |
| `gap` | no | L'intervallo supera `maxGapMs` |
| `calibration_changed` | no | È cambiata la calibrazione |
| `stopped` | no | La sessione è stata arrestata mentre l'evento era aperto |
| `null` | no | L'evento è ancora in corso nell'istantanea |

Gli eventi in corso compaiono nell'elenco con `endedAtMs: null` e durata
osservata fino all'ultimo campione.

## 9 Metriche

Per ogni perimetro (sessione, finestra mobile, occhio sinistro, occhio destro)
il motore espone:

- `elapsedMs`: intervallo dall'inizio alla fine del perimetro, inclusi gap e
  transizioni;
- `validMs`: tempo con dati utilizzabili; per il perimetro bilaterale richiede
  entrambi gli occhi valutabili;
- `closedMs`: parte di `validMs` con occhio o coppia nello stato `closed`;
- `openMs = validMs - closedMs`;
- `unknownMs = elapsedMs - validMs`;
- `coverage = validMs / elapsedMs`, `null` se `elapsedMs` è zero;
- `closureFraction = closedMs / validMs`, `null` se `validMs` è zero;
- `gapMs`, `calibrationTransitionMs` e le statistiche degli episodi.

`closureFraction` conserva il nome sperimentale di quota di chiusura: non è una
percentuale di stanchezza o idoneità.

Statistiche degli episodi:

- `episodeCount`: eventi che si sovrappongono al perimetro; nella sessione sono
  tutti gli eventi, nella finestra anche quelli tagliati dal bordo;
- `completeCount` / `incompleteCount`: nella finestra, `completeCount` richiede
  l'evento completo e interamente contenuto, quindi un evento tagliato è
  incompleto nel perimetro;
- `prolongedCount`: solo eventi completi con durata almeno
  `prolongedClosureMs`;
- `longestCompleteMs`: massima chiusura completa, `null` se non ce ne sono;
- `longestObservedMs`: massima durata osservata, inclusi eventi incompleti.

## 10 Sessione e finestra mobile

La sessione copre dall'inizio alla fine del periodo osservato.

La finestra mobile copre `[max(inizio, fine - rollingWindowMs), fine]`. I tempi
sono calcolati ritagliando gli stessi intervalli della sessione, senza
ricostruire stati. Per gli eventi:

- `durationMs` resta la durata reale dell'evento;
- `windowOverlapMs` è la parte dentro la finestra;
- `completeWithinWindow` è vero solo se l'evento è completo e interamente
  contenuto nella finestra;
- `truncatedAtStart` e `truncatedAtEnd` segnalano i tagli.

Una chiusura che attraversa il bordo non viene quindi presentata come evento
completo più breve: nell'aggregato della finestra conta come incompleta e non
contribuisce a `longestCompleteMs` né a `prolongedCount`.

## 11 Configurazione

Valori iniziali del motore in `src/analysis/config.ts`, tutti sperimentali:

| Parametro | Valore iniziale | Vincolo |
| --- | --- | --- |
| `closedEnter` | 0.25 | `0 <= valore < 1` |
| `openExit` | 0.4 | `closedEnter < valore <= 1` |
| `maxGapMs` | 250 | `> 0` |
| `rollingWindowMs` | 10000 | `> 0` |
| `prolongedClosureMs` | 500 | `> 0` |
| `version` | `n02-config-v1` | stringa non vuota |

Tutti i numeri devono essere finiti. I parametri temporali sono millisecondi
strettamente positivi, anche frazionari. Una versione omessa usa il default;
una versione esplicitamente vuota o composta solo da spazi viene rifiutata.

`configId` combina versione e valori effettivi, ad esempio
`n02-config-v1|closedEnter=0.25|...`. I consumatori devono conservarlo insieme ai
risultati. La configurazione non viene modificata durante una sessione.

Valori iniziali della geometria in `src/analysis/geometry.ts`:

| Parametro | Valore iniziale | Vincolo |
| --- | --- | --- |
| `minEyeWidthPx` | 8 | `> 0` |
| `maxEyeAspectRatio` | 1.2 | `> 0` |
| `coordinateTolerancePx` | 1 | `>= 0` |

Valori iniziali della calibrazione in `src/analysis/calibration.ts`:

| Parametro | Valore iniziale | Vincolo |
| --- | --- | --- |
| `requiredSamplesPerEye` | 8 | intero `>= 2` |
| `maxReferenceDeviation` | 0.05 | `>= 0` |
| `minimumSeparation` | 0.05 | `> 0` |

Anche geometria e calibrazione espongono un `configId` con i valori usati. I tre
identificativi vanno conservati con sessione ed esportazione.

Configurazione dell'adattatore N04:

| Parametro | Valore iniziale | Vincolo |
| --- | --- | --- |
| `modelAssetPath` | da `runtimeAssets` | percorso locale, obbligatorio |
| `wasmAssetPath` | da `runtimeAssets` | directory locale, obbligatoria |
| `delegate` | `CPU` | `CPU` o `GPU` |
| `numFaces` | 2 | intero 1–4 |
| `minFaceDetectionConfidence` | 0.5 | 0–1 |
| `minFacePresenceConfidence` | 0.5 | 0–1 |
| `minTrackingConfidence` | 0.5 | 0–1 |

`numFaces: 2` permette di riconoscere più volti come osservazione ambigua. Il
`configId` dell'adattatore combina delegate, numero di volti e configurazione
geometrica. Versione runtime, checksum del modello e licenze sono in
`docs/inference.md`.

## 12 Fixture e replay

`fixtures/` contiene sequenze tipizzate e `src/analysis/replay.ts` offre
`replayFixture(fixture)`, che avvia il motore, offre i campioni nell'ordine
dichiarato e restituisce l'istantanea finale. Non serve una webcam.

Ogni fixture dichiara configurazione, campioni, eventuale arresto finale e un
sottoinsieme atteso dell'istantanea. I casi coprono: occhi aperti, chiusure
brevi, chiusura prolungata, occhiolino, perdita del tracciamento, gap, tempo
valido nullo, timestamp duplicati o fuori ordine, arresto durante una chiusura,
cambio calibrazione, isteresi e finestra mobile con evento tagliato.
L'elenco e i risultati attesi sono in `fixtures/README.md`; i test sono in
`tests/analysis/`.

## 13 Sessione applicativa

`src/contracts/session.ts` definisce `ApplicationSessionSnapshot`. Lo stato della
webcam resta distinto: un'anteprima attiva non implica una misura disponibile.

| `phase` | Significato e transizioni |
| --- | --- |
| `idle` | Nessuna attività; la scelta esplicita della sorgente consente `loading` |
| `loading` | Richiesta webcam, preparazione video o runtime; successo → `preview`, annullamento → `stopped`, errore → `error` |
| `preview` | Sorgente pronta; l'utente può iniziare `calibrating` o arrestare |
| `calibrating` | Raccoglie riferimenti; successo → `preview` con profilo pronto, dati insufficienti → `preview` con motivi, interruzione → `stopped`/`suspended`/`error` |
| `measuring` | Motore in esecuzione; ingresso solo su comando esplicito e con calibrazione pronta, oppure con una fixture sintetica dichiarata |
| `stopped` | Lavoro terminato e risorse rilasciate; ultimo risultato consultabile, nuovo avvio esplicito per una nuova sessione |
| `suspended` | Scheda nascosta o congelata; acquisizione arrestata, nessuna ripresa automatica |
| `error` | Pipeline arrestata; messaggio e fase dell'errore disponibili, nuovo tentativo esplicito |

`source` distingue webcam, dati sintetici o nessuna sorgente. `engine` è `null`
prima della prima misura, poi conserva l'istantanea anche allo stop; i campi
`interruption` ed `error` spiegano arresti e fallimenti. `error` è valorizzato solo
in fase `error`; `lastSample` è `null` prima di campioni accettati.

`LiveSnapshot` estende direttamente `ApplicationSessionSnapshot`: la webcam
mantiene separati i propri stati, mentre la UI usa `phase`, `calibration`,
`lastSample`, `interruption` ed `error` del contratto. Richiesta e avvio webcam
restano stati dell'acquisizione; `loading` applicativo indica il caricamento
dell'inferenza. Sospensione, errore e cambio sorgente sono distinti.

Quando cambia sorgente, la scheda viene sospesa o si perde il dispositivo,
l'app arresta il motore e l'acquisizione e conserva l'ultimo riepilogo. Gli eventi
in corso terminano con `stopped`; la causa applicativa distinta è conservata in
`interruption`. Il motore non inventa tempo oltre l'ultimo campione. Dopo un
nuovo avvio, il motore riparte azzerato e la webcam richiede una nuova calibrazione.
Un cambio di calibrazione durante la stessa misura resta gestito da N02 con
`calibration_changed`, escludendo l'intervallo di transizione.

Per il replay si conservano i timestamp virtuali originali delle fixture: i timer
UI cambiano soltanto il momento di consegna, senza alterare le durate del motore.
Non si mescolano orologi virtuali e webcam nella stessa sessione.

## 14 Esempi verificabili e decisioni di conservazione

`fixtures/contract-examples.ts` contiene un profilo sintetico, un campione valido,
uno invalido e `createContractExamples()`. Quest'ultima genera dal motore:

- un evento bilaterale completo da 200 ms, con causa `reopened`;
- un evento incompleto da 100 ms, con causa `tracking_lost`;
- un risultato non disponibile: `validMs = 0`, `coverage = 0`,
  `closureFraction = null`, nessuna chiusura inventata.

`tests/integration/contracts.test.ts` usa un consumatore JSON separato da React
e verifica coerenza di versioni, configurazione, calibrazione e motivi di invalidità.
Gli eventi contengono anche i singoli occhi: per il conteggio bilaterale si usa
`session.closures`, e per l'elenco si filtra `kind === 'bilateral'`. La lunghezza
di `session.events` non è il numero di chiusure bilaterali.

Il motore conserva eventi, intervalli e rifiuti senza scartarli silenziosamente.
La sessione live si arresta esplicitamente a 18.000 campioni, con motivo
`sample_limit`, conservando tutti i campioni per l'export. Il grafico conserva al
massimo 2.000 punti e segnala la semplificazione; il raggruppamento marca in modo
conservativo gli intervalli che includono dati mancanti. Il motore produce
l'istantanea per la UI circa ogni 200 ms e allo stop, anziché a ogni campione.
Il limite circoscrive memoria e costo, ma non sostituisce il collaudo N05/T06.

N03 implementa formula, punti e procedura di raccolta. N04 ha fissato runtime,
modello, asset locali e indici proposti; restano da verificare gli indici sul
modello reale, la scelta CPU/GPU e il collaudo dei parametri in N05.
La specifica di funzione citata nel piano è ancora assente: questo contratto
tecnico non sostituisce né attesta una validazione delle misure richieste.

## 15 Verifica C01/N04

Il 13 novembre 2026, con Node.js 24.15.0 e npm 11.12.1, dopo l'integrazione N04:

- `npm.cmd run build`: controllo TypeScript e build riusciti;
- `npm.cmd test`: **121 test superati in 12 file**, inclusi N02, webcam, adattatore
  RGBA, contratti condivisi, geometria, calibrazione, replay sintetico, inferenza
  con runtime finto e harness N05;
- `git diff --check`: nessun errore di spaziatura o marcatore di conflitto.

Come richiesto dall'utente, le prove manuali nel browser e con la webcam restano
all'utente. Questa tabella registra la verifica storica del 13 novembre, non il
numero corrente dei test.

## 16 Verifiche successive di N04/N05

Restano da verificare gli indici MediaPipe sul modello reale, il caricamento
offline di modello e WASM, CPU/GPU, il percorso Web Worker, il costo delle
sessioni lunghe e i valori sperimentali di soglie, gap, finestra, larghezza
minima degli occhi, rapporto EAR massimo, campioni richiesti, stabilità e
separazione dei riferimenti. Queste prove non riaprono le decisioni C01 già fissate.
