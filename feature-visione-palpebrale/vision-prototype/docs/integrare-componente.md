# Integrare il componente di visione palpebrale

Questa guida descrive come incorporare la pipeline del prototipo in un'altra applicazione web. Il componente non è ancora pubblicato come pacchetto npm: va integrato dal repository, mantenendo insieme i moduli TypeScript e gli asset locali del modello. La guida distingue l'uso dell'app React già pronta dal riuso della pipeline dentro un'applicazione esistente.

## Cosa viene integrato

La pipeline elabora localmente i frame della webcam e produce campioni palpebrali calibrati, eventi temporali e riepiloghi:

```text
Webcam → frame RGBA → MediaPipe Face Landmarker → geometria occhi
       → calibrazione → campioni normalizzati → motore temporale
       → snapshot / grafico / export JSON
```

Non vengono trasmessi video o immagini. L'export contiene dati e metadati, non fotogrammi né landmark grezzi. Motore e contratti non dipendono da React; acquisizione, UI e runtime MediaPipe sono adattatori separati.

## Scegliere la modalità d'integrazione

Se l'app ospite è compatibile con React 19, TypeScript e Vite, il percorso più semplice è distribuire `vision-prototype/` come app autonoma e inserirla nell'applicazione con la modalità prevista dal prodotto, per esempio una route o un iframe. Così si mantengono UI, configurazione Vite e asset. Con iframe, l'host deve consentire fotocamera e contesto sicuro; verificare i permessi nel deployment.

Se la UI esistente deve controllare direttamente la feature, integrare i moduli sorgente e collegarli ai componenti host. Non copiare soltanto `LiveSession`: includere contratti, acquisizione, runtime e asset. I moduli sono sorgenti interne, non una libreria stabile; fissare la revisione del repository e ricontrollare i contratti a ogni aggiornamento.

## Requisiti e asset

- TypeScript con moduli ES; per la UI fornita: React 19 e Vite 8.
- `@mediapipe/tasks-vision` alla versione fissata in `vision-prototype/package.json` e nel lockfile.
- Browser moderno con accesso webcam da `localhost`, `127.0.0.1` o HTTPS.
- Modello Face Landmarker e runtime WASM serviti localmente, dalla stessa origine dell'app.

Il prototipo conserva modello e WASM in `public/models/`; provenienza, licenza e checksum sono in [`../public/models/README.md`](../public/models/README.md). Copiare entrambi gli asset nella cartella pubblica dell'host e mantenere i percorsi coerenti con la base URL del deployment. Evitare URL CDN per questi asset. Le variabili di build `VITE_` sono pubbliche e non devono contenere segreti.

Per avviare il prototipo:

```sh
cd vision-prototype
npm ci
npm run dev
```

In PowerShell, se `npm.ps1` è bloccato, usare `npm.cmd`. La configurazione per sottopercorso e asset è descritta nel [README del prototipo](../README.md#configurazione-degli-asset).

## Collegare la pipeline alla UI esistente

### 1. Portare i moduli e rispettare i contratti

Includere `src/contracts/`, `src/analysis/`, `src/inference/`, `src/capture/`, `src/validation/` e, se serve l'export, `src/integration/`. Evitare di ridefinire tipi come `AnalysisSample`, `ApplicationSessionSnapshot` o la geometria: devono attraversare i moduli senza conversioni implicite. Il contratto corrente è C01 v2; gli export sono `crewready-session-v2`.

### 2. Creare il runtime locale

Usare `MediaPipeFaceLandmarkerAdapter` con la configurazione in `src/inference/config.ts` e il runtime in `src/inference/mediapipe-runtime.ts`. I percorsi di modello e WASM devono risolvere verso file distribuiti localmente. Attendere `init()` prima dell'analisi e chiamare `release()` al termine o in caso d'interruzione.

Il prototipo risolve i percorsi in `src/app/runtime-config.ts`; il collegamento completo è in `src/app/App.tsx` e `src/app/live-session.ts`. Questi ultimi sono dettagli applicativi, non un'API pubblica stabile.

### 3. Collegare la webcam

Usare `useWebcam` e gli adattatori in `src/capture/` per ottenere frame RGBA con timestamp monotono. Il consumer deve sempre rilasciare ogni frame, anche in caso di errore o annullamento. `LiveSession.consume` applica questa regola.

Avviare l'acquisizione solo dopo un'azione esplicita dell'utente. Gestire permesso negato, webcam assente, cambio dispositivo, pagina nascosta e arresto come stati distinti: sospensioni ed errori non devono essere mostrati come un normale stop. L'uso della fotocamera richiede un contesto sicuro; non aprire la build tramite `file://`.

### 4. Calibrare prima di misurare

La calibrazione raccoglie riferimenti a occhi aperti e chiusi. Nella sessione fornita il flusso è `startOpen()` → raccogliere campioni → `startClosed()` → raccogliere campioni → `finishCalibration()`. Avviare la misura solo con un profilo valido. Una variazione della risoluzione o un'interruzione invalida la calibrazione e richiede una nuova procedura. Mostrare progresso e motivi di calibrazione insufficiente, inclusa l'interruzione.

### 5. Avviare e fermare la misura

Dopo una calibrazione valida, `startMeasurement()` avvia `TemporalEngine`. I frame elaborati vengono convertiti con `toAnalysisSample()` e offerti al motore. `LiveSnapshot` espone fase, calibrazione, ultimo campione, snapshot dell'engine, progresso, interruzioni ed errori. In alternativa, collegare direttamente `TemporalEngine` usando i contratti in `src/contracts/engine.ts` e `src/contracts/sample.ts`.

La misura termina con `stopMeasurement()` o con un'interruzione. La sessione si arresta automaticamente a 18.000 campioni e conserva i dati per l'export. Il grafico è limitato a 2.000 punti. Questi limiti non dimostrano da soli prestazioni adeguate per ogni dispositivo o durata.

### 6. Mostrare i risultati

Usare `EngineSnapshot` per copertura, tempo valido, quota di chiusura ed eventi. I valori `null` indicano dati non disponibili e non vanno convertiti in zero. Le unità sono millisecondi, apertura normalizzata e frazioni tra 0 e 1. La UI host può avere un aspetto diverso, ma non dovrebbe ricalcolare gli eventi dai punti del grafico.

### 7. Esportare o consumare una sessione

`LiveSession.exportSnapshot(snapshot)` prepara il pacchetto webcam dall'istantanea visualizzata. `createSessionExport()` è l'adattatore indipendente dalla UI; `serializeSessionExport()` produce JSON e `summarizeExport()` mostra un esempio di lettura. `parseSessionExport(jsonText)` valida formato, limiti e coerenza rigiocando i campioni nel motore.

Il parser supporta C01 v2 e session v2, fino a 18.000 campioni e 50 milioni di caratteri. La verifica è sincrona e controlla la coerenza, ma non autentica il mittente. Gli export v1 non sono accettati dal parser v2. Schema e esempio di consumatore sono descritti in [`integration.md`](integration.md).

`createSessionValidationReport()` da `src/validation/session-report.ts` crea il report N05. Senza annotazioni non dichiara metriche di accuratezza. I test sintetici e quelli col runtime simulato non sostituiscono la validazione su sessioni webcam annotate.

## Verifiche prima della consegna

Nella cartella del prototipo:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Nel deployment effettivo verificare avvio con permesso webcam, calibrazione, misura, arresto, riavvio, errori e cambio sorgente; funzionamento offline dopo il caricamento dell'app; URL sotto il sottopercorso previsto; assenza di richieste CDN; rilascio delle risorse e download JSON. Build e test automatici non provano questi casi nel browser né la qualità delle misure su persone reali. La checklist è in [`validation-results.md`](validation-results.md) e [`capture.md`](capture.md).

## Limiti

- La pipeline è sperimentale, non diagnostica o clinica; soglie e prestazioni vanno valutate sul caso d'uso reale.
- Non esiste ancora un pacchetto npm con API versionata: l'host deve fissare la revisione integrata e verificare gli aggiornamenti.
- Il percorso MediaPipe in Web Worker non è implementato; l'inferenza usa il runtime nel thread principale.
- L'export consente di riprodurre il motore dai campioni calibrati, non il video o l'inferenza grezza.
- T06 richiede il collaudo finale, incluso offline e sottopercorso; N05 quantitativo richiede dati annotati.

