# CrewReady — prototipo di visione palpebrale

## Stato e ambito

T01 predispone React, TypeScript, Vite e il runner Vitest. Il percorso webcam di T03
ora offre avvio/arresto espliciti, anteprima, selezione della sorgente e gestione
degli errori. L'anteprima non esegue inferenza, registrazione, trasmissione o
misure palpebrali.

N01 fornisce contratti e fixture; N02 aggiunge il motore temporale puro, il replay
senza webcam e i test deterministici. N03 aggiunge geometria palpebrale, controlli
di ammissibilità, raccolta dei riferimenti di calibrazione e normalizzazione per
occhio. N04 aggiunge l'adattatore MediaPipe, gli asset locali di modello e WASM,
la conversione dei landmark e il collegamento strutturale alla sorgente T03.
La UI collega webcam, inferenza, calibrazione e motore per la misura e permette
l'esportazione JSON versionata di sessioni webcam e sintetiche, secondo il
[piano](../docs/CrewReady_Piano_Implementazione_Visione_Palpebrale.md).
I contratti correnti sono stabiliti in **C01 v2**. La webcam è allineata al formato RGBA
condiviso tramite `src/capture/inference-frame-adapter.ts`. Stati applicativi,
calibrazione, tempi e proprietà dei buffer sono definiti in
[docs/contracts.md](docs/contracts.md); esempi verificabili in
`fixtures/contract-examples.ts`.

Per provare la webcam: aprire la pagina locale, premere **Avvia webcam** e
consentire l'accesso alla sola fotocamera nel browser. **Arresta** interrompe anche
un avvio in corso. Cambiare sorgente, nascondere la scheda o minimizzare il browser
ferma l'acquisizione; per ripartire serve un nuovo avvio esplicito.
La casella **Anteprima a specchio** modifica solo la visualizzazione.
Dettagli tecnici e checklist del collaudo fisico in [docs/capture.md](docs/capture.md).

Per una misura webcam: avviare la webcam e premere **Prepara analisi**. Avviare
la calibrazione con gli occhi aperti, continuare con gli occhi chiusi e completare
la procedura quando i campioni richiesti sono disponibili. Dopo il successo, usare
**Avvia misura** e **Arresta misura**. Un cambio di sorgente, la sospensione della
scheda o l'arresto della webcam interrompono l'analisi e richiedono una nuova
calibrazione. Il modello e il runtime sono locali; le prove con webcam fisica e
la validazione delle misure restano da eseguire.
La casella **Mostra punti palpebrali** abilita l'overlay facoltativo. I test
automatici della pipeline usano inferenza simulata; le prove reali restano aperte.

La sezione **Replay sintetico** permette di scegliere una fixture e riprodurla,
metterla in pausa o azzerarla senza webcam. Il grafico mostra le aperture e le
interruzioni; il riepilogo e gli eventi sono prodotti dal motore temporale.
I valori sono simulati, non misure ottenute dalla persona davanti alla webcam.

I pulsanti **Esporta JSON webcam** e **Esporta JSON sintetico** salvano il risultato
mostrato, i campioni e i metadati necessari al motore. Schema e istruzioni per un
consumatore separato sono in [docs/integration.md](docs/integration.md). Per
incorporare la pipeline in un'altra applicazione, seguire la [guida dettagliata
d'integrazione](docs/integrare-componente.md).

## Requisiti e avvio

- Node.js **24.15.0 o successivo della serie 24**; `.nvmrc` indica la versione verificata.
- npm **11**; versione usata per il lockfile: **11.12.1**.
- Browser moderno con accesso alla fotocamera da localhost, 127.0.0.1 oppure HTTPS.

Dalla cartella `vision-prototype/`:

```powershell
npm.cmd ci
npm.cmd run dev
```

Aprire `http://127.0.0.1:5173`. Interrompere il server con `Ctrl+C`.
Su Windows usare `npm.cmd` se PowerShell blocca `npm.ps1`: non occorre cambiare
l'execution policy. Su altri sistemi gli stessi comandi funzionano con `npm`.

L'installazione iniziale richiede il registro npm. Le dipendenze dirette sono
fissate a versioni esatte e `package-lock.json` vincola quelle transitive.
Usare `npm.cmd ci` per riprodurre l'installazione; chi gestisce T01 mantiene
dipendenze e lockfile. Il runtime di inferenza `@mediapipe/tasks-vision@1.2.3` è
fissato nel lockfile; modello e WASM sono già in `public/models/`.

## Comandi

| Comando | Scopo |
| --- | --- |
| `npm.cmd run dev` | Server locale Vite, porta 5173 |
| `npm.cmd run typecheck` | Controllo TypeScript di applicazione, configurazioni e test |
| `npm.cmd run build` | Controllo dei tipi e build in `dist/` |
| `npm.cmd run preview` | Serve la build su `http://127.0.0.1:4173` |
| `npm.cmd test` | Esecuzione singola Vitest |
| `npm.cmd run test:watch` | Vitest in modalità osservazione |

Le porte sono fisse: se occupate, Vite segnala l'errore. È possibile cambiarle
con `npm.cmd run dev -- --port 5174` o l'equivalente per `preview`.

Vitest usa l'ambiente **Node**, senza DOM, adatto al motore TypeScript puro.
Riconosce `tests/**/*.test.ts` e `src/**/*.test.ts`; importare esplicitamente
`describe`, `it`, `expect` da `vitest`. Le suite di acquisizione usano dispositivi
simulati e verificano rilascio delle risorse, permessi tardivi, errori, sospensione,
riavvio e consegna dei frame senza code. Il comando fallisce se non trova test.

Le suite N02 in `tests/analysis/` coprono isteresi, eventi completi e incompleti,
gap, cambio calibrazione, arresto, reset, finestra mobile e stabilità fra
frequenze diverse. Le suite N03 coprono formula EAR, correzione delle scale,
punti fuori immagine, rapporti implausibili e la procedura di calibrazione con
progresso, stabilità, separazione minima e normalizzazione. Le suite N04 usano
un runtime MediaPipe finto e landmark sintetici per verificare conversione,
volto assente o ambiguo, errori, rilascio e metadati di provenienza.

## Motore temporale N02

`src/analysis/` contiene un motore TypeScript puro, senza DOM, React, webcam o
rete. L'API è `start`, `processSample`, `getSnapshot`, `stop` e `reset`; i
contratti sono in `src/contracts/`. Il motore calcola tempo valido, copertura,
tempo chiuso, quota di chiusura, episodi prolungati e massima chiusura completa,
distinguendo sessione e finestra mobile.

Le regole temporali e i nomi dei campi sono in
[docs/contracts.md](docs/contracts.md); formule e limiti sperimentali sono in
[docs/measurement-method.md](docs/measurement-method.md). Le sequenze sintetiche
e i risultati attesi sono in [fixtures/README.md](fixtures/README.md) e possono
essere riprodotte con `replayFixture` di `src/analysis/replay.ts`, senza webcam.

### Verifica N02 — 13 novembre 2026

Ambiente: Windows, Node.js 22.18.0 (il progetto dichiara la serie 24; `npm.cmd ci`
ha segnalato la differenza di engine solo come avviso).

| Verifica | Esito |
| --- | --- |
| `npm.cmd run typecheck` | Controllo TypeScript riuscito |
| `npm.cmd test` | 2 file, 24 test superati, inclusi tutti i casi fixture |
| `npm.cmd run build` | Controllo dei tipi e build Vite riusciti |

I test coprono i risultati attesi delle fixture e le regole non espresse da una
singola sequenza: validazione della configurazione, campioni malformati, uso
scorretto dell'API, riavvio dopo reset, gap oltre `maxGapMs`, cambio calibrazione
e stabilità a 10 Hz e 20 Hz. Webcam, calibrazione reale, inferenza su modello
reale e prestazioni restano da verificare nei task N05 e T04-T06.

## Geometria e calibrazione N03

`src/analysis/geometry.ts` calcola il rapporto palpebrale EAR dai sei punti per
occhio, converte le coordinate normalizzate in pixel per correggere le scale
dell'immagine e rifiuta punti mancanti, fuori immagine, occhi troppo stretti o
rapporti implausibili. Gli indici MediaPipe proposti sono esportati per N04, che
dovrà verificarli.

`src/analysis/calibration.ts` gestisce la raccolta guidata delle fasi aperto e
chiuso, il progresso per le schermate T04, le mediane per occhio, la stabilità,
la separazione minima e la normalizzazione `open-closed-v1`. Un esito fallito
espone motivi distinti per occhio, non un profilo parziale utilizzabile.

La formula e i controlli sono in
[docs/measurement-method.md](docs/measurement-method.md); la procedura e i
messaggi per T04 sono in [docs/calibration.md](docs/calibration.md).

### Verifica N03 — 13 novembre 2026

| Verifica | Esito |
| --- | --- |
| `npm.cmd run typecheck` | Controllo TypeScript riuscito |
| `npm.cmd test` | 5 file, 63 test superati; 13 test N03 fra geometria e calibrazione |
| `npm.cmd run build` | Controllo dei tipi e build Vite riusciti |

Le prove usano punti e osservazioni sintetiche, senza webcam. La calibrazione su
persone reali, gli indici effettivi di MediaPipe e la stabilità delle soglie
restano da verificare in T04 e N05.

## Inferenza MediaPipe N04

`src/inference/` contiene l'adattatore per MediaPipe Face Landmarker. Carica
modello e WASM da percorsi locali, converte i landmark nella geometria N03 e
gestisce volto assente, più volti, landmark mancanti ed errori con codici
espliciti. `createMediaPipeFrameConsumer` consuma il frame RGBA di C01 prodotto
da T03; il rilascio del runtime resta esplicito con `release()`.

Runtime e modello sono fissati: `@mediapipe/tasks-vision@1.2.3`, modello
`face_landmarker/float16/1`, SHA-256
`64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`,
licenza Apache-2.0. Dettagli, asset e percorso Web Worker in
[docs/inference.md](docs/inference.md).

### Verifica N04 — 13 novembre 2026

| Verifica | Esito |
| --- | --- |
| `npm.cmd run typecheck` | Controllo TypeScript riuscito |
| `npm.cmd test` | 12 file, 121 test superati; 12 test N04 con runtime finto |
| `npm.cmd run build` | Controllo dei tipi e build Vite riusciti |
| Asset locali | Modello presente, 3 758 596 byte e SHA-256 verificato; quattro file WASM copiati dal pacchetto |

Il caricamento reale di modello, WASM e GPU/CPU nel browser non è stato eseguito
in questa sede: T04 è collegato, ma serve il collaudo con webcam fisica.
Il percorso Web Worker è documentato ma non implementato.

## Validazione N05

`src/validation/` contiene il harness per confrontare chiusure annotate ed
eventi del motore, riepilogare latenze e frequenza di inferenza e produrre un
report JSON con le metriche già calcolate da `EngineSnapshot`.

Il metodo, il protocollo per occhiali/riflessi/luce/rotazioni/uscita
dall'inquadratura e i risultati sintetici sono in
[docs/validation-results.md](docs/validation-results.md). La validazione
quantitativa con webcam e persone reali non è ancora stata eseguita: richiede
sessioni annotate. Le prove manuali senza annotazioni restano qualitative.

### Verifica N05 — 13 novembre 2026

| Verifica | Esito |
| --- | --- |
| `npm.cmd run typecheck` | Controllo TypeScript riuscito |
| `npm.cmd test` | 12 file, 121 test superati; 14 test N05 |
| `npm.cmd run build` | Controllo dei tipi e build Vite riusciti |

I test N05 verificano abbinamento uno-a-uno, eventi mancati e falsi positivi,
tolleranze, differenze di completezza, percentili di latenza e report senza
ricalcolo delle metriche. Non attestano accuratezza su persone reali.

### Verifica del merge C01/N03/N04

Verifica del merge, 13 novembre 2026: su Node.js 24.15.0 e npm 11.12.1,
`npm.cmd run build` (incluso controllo dei tipi) e `npm.cmd test` sono riusciti:
**121 test superati in 12 file**. I test verificano contratti C01, webcam RGBA,
profili geometrici e calibrazione, motore N02, replay sintetico T02, adattatore
N04 con runtime finto e harness N05. Nessuna prova manuale nel browser è stata
eseguita.

Questi risultati datati sono storici. La verifica corrente, compresi i test per
volti ambigui, stati C01 v2, limiti, export v2 e report N05, è riportata in
[docs/integration.md](docs/integration.md).

## Configurazione degli asset

I valori predefiniti non richiedono un file `.env`. Per modificarli:

```powershell
Copy-Item .env.example .env.local
```

| Variabile | Default | Significato |
| --- | --- | --- |
| `VITE_APP_BASE_PATH` | `/` | Base di pubblicazione, con `/` iniziale e finale |
| `VITE_MODEL_PATH` | `models/face_landmarker.task` | Percorso del modello locale |
| `VITE_WASM_PATH` | `models/wasm/` | Directory del runtime WASM locale |

I percorsi modello e WASM relativi vengono prefissati con la base dell'app in
`src/app/runtime-config.ts`. Un `/` iniziale li riferisce invece alla radice del
server. Il modulo rifiuta URL esterni; l'adattatore N04 usa `runtimeAssets` quando
viene collegato alla UI.
Le variabili `VITE_` sono pubbliche e incorporate nella build: non inserirvi segreti.
Riavviare il server dopo modifiche all'ambiente e ricostruire per la produzione.

Esempio di pubblicazione sotto `/crewready/vision/`: impostare
`VITE_APP_BASE_PATH=/crewready/vision/` in `.env.local`, eseguire la build e servire
`dist/` sotto quel percorso. Anche `preview` usa la base configurata.
Vite gestisce `BASE_URL` per gli asset; non aprire `dist/index.html` via `file://`.

`public/` viene copiato nella build. Modello `face_landmarker.task`, runtime
MediaPipe e WASM sono inclusi in `public/models/`; provenienza, checksum e
licenze sono in [docs/inference.md](docs/inference.md) e
[public/models/README.md](public/models/README.md). L'app non usa CDN o font
remoti. Il funzionamento offline dell'intera pipeline resta da verificare in T06.

## Struttura e responsabilità

```text
src/
  app/           avvio e collegamento dei moduli; configurazione asset
  ui/            interfaccia e stili
  capture/       webcam, ciclo dei frame, hook React e test di acquisizione (T03)
  integration/   esportazione e adattatore (T05)
  contracts/     contratti condivisi (N01/C01)
  analysis/      motore, geometria, calibrazione, configurazione e replay (N02/N03)
  inference/     adattatore MediaPipe, conversione e consumer T03 (N04)
  validation/    confronto eventi, metriche prestazioni e report (N05)
public/models/   modello e WASM locali verificati (N04)
fixtures/        sequenze sintetiche e risultati attesi (N01/N02)
tests/analysis/  test deterministici di motore, fixture, geometria e calibrazione
src/inference/   test N04 con runtime finto, senza WASM o webcam
tests/validation/ test N05 di matching, tolleranze e prestazioni
tests/integration/ verifiche applicative (T05/T06)
docs/            contratti, metodo, calibrazione, inferenza e validazione
```

Produttori e consumatori usano i contratti C01 v2 di `docs/contracts.md`.
Variazioni incompatibili richiedono una nuova versione e l'aggiornamento dei
moduli coinvolti e delle fixture. N03 fornisce geometria e calibrazione su questo
confine; N04 consuma i frame RGBA per l'inferenza. La UI T02 può procedere con il
motore e il replay sintetico.

La specifica `CrewReady_Feature_Visione_Palpebrale.md`, citata dal piano, non è
presente nel repository al momento di T01.

## Verifica T01 — 13 novembre 2026

Ambiente: Windows, Node.js 24.15.0, npm 11.12.1.

| Verifica | Esito |
| --- | --- |
| `npm.cmd ci` | Installazione pulita dal lockfile riuscita |
| `npm.cmd run build` | Controllo TypeScript e build riusciti |
| `npm.cmd test` | Runner avviato; nessun test ancora presente |
| Server di sviluppo | HTTP 200 per pagina e moduli applicativi |
| Preview della build | HTTP 200 per la pagina con riferimenti agli asset compilati |
| Base `/crewready/vision/` | Pagina e configurazione asset servite dal sottopercorso in sviluppo |

Queste sono verifiche di struttura, compilazione e servizio HTTP. Il collaudo
visivo nel browser, la webcam e le prestazioni della pipeline restano da eseguire
nei task successivi. I server usati per le verifiche sono stati arrestati.
