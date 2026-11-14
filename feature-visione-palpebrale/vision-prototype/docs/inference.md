# Inferenza MediaPipe — N04

Versione: **N04**, 13 novembre 2026. L'adattatore è in `src/inference/`; la
geometria di destinazione è quella di N03. T04 collega l'adattatore a UI e
calibrazione; il collaudo con webcam reale resta da eseguire. Non è una validazione clinica.

## 1 Scelte fissate

| Voce | Valore |
| --- | --- |
| Runtime | `@mediapipe/tasks-vision` |
| Versione runtime | `1.2.3` (esatta in `package.json` e nel lockfile) |
| Licenza runtime | Apache-2.0 |
| Modello | MediaPipe Face Landmarker, float16 |
| Identificativo modello | `face_landmarker/float16/1/face_landmarker.task` |
| Dimensione modello | 3 758 596 byte |
| SHA-256 modello | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` |
| Licenza modello | Apache-2.0 |
| Metodo geometrico | `n03-ear-v1` |

Provenienza:

- runtime: `https://www.npmjs.com/package/@mediapipe/tasks-vision/v/1.2.3`
- modello:
  `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`
- licenze e condizioni MediaPipe: `https://github.com/google-ai-edge/mediapipe`

I valori sono esportati da `src/inference/mediapipe-runtime.ts` e vengono
inseriti nei metadati dell'adattatore. Un aggiornamento del modello o del runtime
richiede una nuova verifica e l'aggiornamento di checksum, versione e test.

## 2 Asset locali

I file sono inclusi in `public/models/`:

```text
public/models/
  face_landmarker.task
  wasm/
    vision_wasm_internal.js
    vision_wasm_internal.wasm
    vision_wasm_module_internal.js
    vision_wasm_module_internal.wasm
  README.md
```

`public/` viene copiato nella build. Non ci sono richieste a CDN durante
l'esecuzione: modello e WASM sono serviti dalla stessa origine dell'app.

L'adattatore non incorpora percorsi o variabili d'ambiente. T04 passa i
percorsi risolti da `src/app/runtime-config.ts`:

```ts
import { runtimeAssets } from '../app/runtime-config';
import { MediaPipeFaceLandmarkerAdapter } from '../inference';

const adapter = new MediaPipeFaceLandmarkerAdapter({
  modelAssetPath: runtimeAssets.modelPath,
  wasmAssetPath: runtimeAssets.wasmPath,
});
```

Verifica locale del modello:

```powershell
(Get-FileHash public\models\face_landmarker.task -Algorithm SHA256).Hash.ToLower()
(Get-Item public\models\face_landmarker.task).Length
```

## 3 API e ciclo di vita

```ts
const adapter = new MediaPipeFaceLandmarkerAdapter(config);
await adapter.init();                 // carica modello e WASM
adapter.processFrame(frame, signal);  // consuma un InferenceFrame RGBA di C01
adapter.release();                    // chiude il runtime

adapter.getStatus();                  // stato, frame, ultimo numero di volti, errore
adapter.getProvenance();              // versioni, licenze, checksum, configId
```

- `init()` è idempotente; chiamate concorrenti condividono la stessa Promise.
- `release()` chiude il runtime. Un caricamento che termina dopo il rilascio
  viene chiuso senza essere usato. Dopo `release()` è possibile un nuovo `init()`.
- `processFrame()` è sincrono e usa il buffer RGBA di `InferenceFrame`. Un frame
  già annullato restituisce `{ status: 'cancelled' }` senza chiamare il runtime.
- Timestamp non crescenti, frame malformati, buffer già rilasciati, uso prima di
  `init()` ed errori del runtime lanciano `InferenceError` con un `code` esplicito.

`createMediaPipeFrameConsumer(adapter, onResult)` adatta l'adattatore a
`InferenceFrameConsumer` di C01. Il pump consegna un solo frame alla volta;
l'adattatore non crea code e il consumer rilascia il buffer in un `finally`. Il
proprietario della sessione chiama `release()` allo stop.

## 4 Conversione e casi senza volto

`convertFaceLandmarkerResult` è una funzione pura:

| Uscita MediaPipe | Risultato |
| --- | --- |
| Nessun volto | `no_face`, entrambi gli occhi invalidi con `not_tracked` |
| Più volti | `ambiguous`, entrambi invalidi con `ambiguous_face`; nessun volto scelto |
| Meno di 388 landmark | `invalid_landmarks`, motivo `landmark_missing` |
| Punti fuori immagine | `invalid_landmarks` o validità parziale, motivo `out_of_range` |
| Un volto utilizzabile | `face`, EAR per occhio secondo N03 |

Il risultato contiene sempre `FaceGeometryObservation`. La calibrazione e il
motore possono quindi ricevere un'osservazione invalida, senza confondere un
volto assente con occhi aperti.

## 5 Percorso Web Worker

Non è il percorso predefinito in N04. È compatibile con il progetto e va
verificato in T04/T06:

1. il thread principale riceve `InferenceFrame` RGBA da C01 e trasferisce
   `pixels.data.buffer`, `width`, `height` e `timestampMs` al Worker;
2. il Worker ricostruisce `ImageData` e usa lo stesso modello MediaPipe;
3. converte con `convertFaceLandmarkerResult` e restituisce la geometria;
4. il thread principale ignora i risultati di sessioni annullate e rilascia il
   frame C01 secondo il contratto.

Requisiti e limiti: supporto a `OffscreenCanvas`/WebGL2 per il percorso GPU,
costo di copia o trasferimento del buffer, necessità di una coda esplicita fra
thread e gestione dell'annullamento. La configurazione CPU può funzionare anche
senza WebGL2. T03 produce già RGBA tramite `inference-frame-adapter.ts`; il
Worker non è implementato in N04.

## 6 Comportamento e limiti

- `numFaces` predefinito è 2: serve a riconoscere la presenza di più volti e
  rifiutare l'osservazione ambigua. Con `numFaces: 1` questa ambiguità non viene
  rilevata.
- `delegate` predefinito è `CPU` per ridurre dipendenze da WebGL2. `GPU` è
  configurabile e va verificato sul browser di destinazione.
- Il modello può perdere il volto con occhiali, riflessi, rotazioni o occlusione.
  N04 non interpreta questi casi come occhi chiusi: produce invalidità esplicite.
- Il timestamp è quello del pump di T03 (`performance.now()`), non il tempo del
  sensore. Il motore N02 usa gli stessi timestamp.
- L'adattatore non gestisce webcam, calibrazione, overlay o esportazione.
- Le prestazioni reali e l'accuratezza dei landmark richiedono N05.

## 7 Verifiche automatiche

I test in `src/inference/inference.test.ts` usano un runtime finto e landmark
sintetici; non caricano WASM, modello o DOM:

- conversione di occhi aperti/chiusi con EAR atteso;
- volto assente, landmark insufficienti, più volti e punti fuori immagine;
- init idempotente, frame annullati, timestamp non monotoni e frame malformati;
- errori di caricamento e inferenza, rilascio e nuovo init;
- metadati di provenienza, versione, checksum e licenza.

Comandi eseguiti il 13 novembre 2026:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

## 8 Da verificare con T04/N05

- Collegamento reale di `runtimeAssets` e del consumer RGBA C01 al pump webcam.
- Caricamento offline di modello e WASM dopo la build.
- Scelta CPU/GPU, latenza e frequenza di inferenza sul PC di prova.
- Eventuale passaggio al Worker e relativa coda/trasferimento del buffer.
- Robustezza con occhiali, riflessi, illuminazione e rotazioni.
