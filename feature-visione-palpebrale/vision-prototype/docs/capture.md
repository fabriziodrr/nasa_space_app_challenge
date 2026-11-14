# Acquisizione webcam — T03

## Stato

Implementata la parte applicativa e allineata a **C01 v2**. Il confine pubblico
verso l'inferenza usa `InferenceFrame` RGBA di `src/contracts/`; il frame video
in prestito resta un dettaglio interno a `src/capture/`.
Il collaudo con webcam fisica rimane a carico dell'utente.

## Comportamento visibile

- L'accesso viene chiesto solo premendo **Avvia webcam**, con `audio: false`.
- L'avvio attraversa autorizzazione, preparazione del video e anteprima attiva.
- **Arresta** è disponibile anche durante la richiesta di permesso o l'avvio.
- La sorgente predefinita funziona anche se il browser non espone ancora l'elenco
  dei dispositivi; le etichette vengono aggiornate dopo l'autorizzazione.
- Cambiare sorgente ferma e libera quella precedente, senza avviare automaticamente
  la nuova. L'elenco viene aggiornato anche su `devicechange`.
- Specchiare l'anteprima usa solo CSS: la sorgente per l'analisi resta originale.
- Una scheda nascosta, `pagehide` o `freeze` interrompono l'acquisizione e rilasciano
  tutte le tracce. Tornare alla pagina non riaccende la fotocamera.
- Revoca/interruzione della traccia, perdita del segnale, errori video e del
  consumatore fermano la webcam e mostrano un messaggio recuperabile.
- Calibrazione, inferenza, misure, overlay ed esportazione sono collegati alla UI;
  il collaudo manuale su webcam fisica resta da eseguire.

Risoluzione e numero dei fotogrammi ricevuti descrivono solo l'acquisizione.
Non attestano valutabilità degli occhi o disponibilità di una misura.

## Componenti e responsabilità

`webcam.ts` gestisce stream, riproduzione, messaggi, listener e rilascio.
`video-frame-pump.ts` consegna immagini nuove al consumatore.
`inference-frame-adapter.ts` copia il video in buffer RGBA conformi a C01.
`use-webcam.ts` collega la sorgente al video React e aggiorna la lista dispositivi.
`app/App.tsx` gestisce i controlli visibili e non calcola metriche palpebrali.

`getUserMedia` richiede idealmente 1280 × 720 e 30 fps, senza imporli; il browser
può restituire un altro formato. La scelta esplicita del dispositivo usa il suo
identificativo esatto. Il video ha `muted` e `playsInline`.

Stop, errore e smontaggio rimuovono i listener delle tracce, cancellano il callback
dei fotogrammi, invocano `stop()` su tutte le tracce e azzerano `video.srcObject`.
Gli identificativi di generazione impediscono a vecchie risposte di sovrascrivere
un avvio successivo. Se un permesso arriva dopo lo stop o lo smontaggio, il relativo
stream viene immediatamente fermato senza essere mostrato.

Il browser non offre un annullamento diretto della Promise di `getUserMedia`:
il suo prompt potrebbe restare visibile dopo **Arresta**. L'app invalida la richiesta
e libera l'eventuale stream appena arriva. Per `video.play()` si attende al massimo
15 secondi; l'attesa termina subito allo stop, anche se la Promise resta pendente.

## Interfaccia C01 per il consumatore

Il terzo argomento opzionale del costruttore `WebcamCapture` accetta un
`InferenceFrameConsumer`, indipendente da React. La UI attuale usa il consumatore nullo,
che aggiorna soltanto contatore e dimensioni. I test usano anche consumatori lenti
e fallibili, senza webcam o inferenza.

```ts
import { WebcamCapture } from '../capture/webcam';

const capture = new WebcamCapture(videoElement, updateView, (frame, signal) => {
  try {
    if (signal.aborted) return;
    // N04 usa questi pixel RGBA tramite createMediaPipeFrameConsumer.
    console.debug(frame.timestampMs, frame.width, frame.height, frame.pixels.format);
  } finally {
    frame.release();
  }
});

await capture.start();
capture.stop();
capture.dispose(); // allo smontaggio del consumatore
```

| Campo | Significato |
| --- | --- |
| `frameId` | Intero positivo crescente per istanza di acquisizione |
| `source` | Origine `webcam` |
| `width`, `height` | Dimensioni reali del video in pixel |
| `timestampMs` | Tempo monotono del callback rispetto a `performance.timeOrigin`, in ms |
| `pixels` | Buffer RGBA sRGB indipendente, quattro byte per pixel |
| `release()` | Fine dell'uso del buffer; idempotente |

Il secondo argomento del consumer, `signal`, è invalidato allo stop o al cambio
di sessione. `mediaTimeSeconds` serve soltanto alla deduplicazione interna.

Non è un timestamp del sensore. I timestamp non vengono convertiti in durate di
chiusura: questa responsabilità è del motore N02.

L'adattatore copia il video originale prima del primo `await`, tramite un canvas
non aggiunto alla pagina. Il canvas è creato solo quando un consumer viene
effettivamente collegato: l'anteprima da sola non alloca copie RGBA. Ciascun buffer
rimane valido fino a `release()`, poi non si usa più. L'adattatore libera anche
buffer dimenticati o coinvolti in errori dopo la conclusione del consumer.

Per un Worker si trasferisce `pixels.data.buffer` con i metadati; `release` e
`signal` restano nella pagina. Il consumer attende la conferma di fine elaborazione,
ignora risultati annullati e rilascia il frame in un `finally`. Lo stop non
interrompe a forza una Promise e non libera pixel che il consumer sta usando.

Si usa `requestVideoFrameCallback`, quando disponibile. Il fallback usa
`requestAnimationFrame`, scarta `currentTime` già visto e usa anche
`getVideoPlaybackQuality().totalVideoFrames` quando il browser lo valorizza.
Se il contatore dei frame non è disponibile, il fallback basato su `currentTime`
è una deduplicazione approssimata, da verificare sul browser di destinazione.

Durante un'elaborazione asincrona non si accodano altre immagini. L'anteprima
continua e il successivo callback viene richiesto al termine del consumatore.
Anche dopo un riavvio si attende la fine del precedente consumatore prima di
consegnare un altro frame: gli adattatori devono quindi terminare o rispettare
l'annullamento. Timestamp duplicati/non crescenti e immagini non pronte vengono
scartati; i gap restano osservabili, senza generare campioni intermedi.

## Verifiche automatiche

Verifiche eseguite il 13 novembre 2026 su Windows, Node.js 24.15.0,
npm 11.12.1. Nessuna nuova dipendenza.

- `npm.cmd run build`: controllo TypeScript e build di produzione riusciti.
- `npm.cmd test`: **26 test superati**, suite in `src/capture/webcam.test.ts`, con track, stream,
  callback video, RAF, visibilità e permessi simulati.
- Casi coperti: avvio esplicito senza audio, rilascio allo stop, concessione tardiva,
  annullamento di `play`, errori e nuovo tentativo, interruzione delle tracce,
  sospensione, smontaggio, riavvii, timeout, assenza API/contesto insicuro,
  consumer lento o fallibile, vecchi errori, duplicati, timestamp e fallback.
- Server di sviluppo: HTTP 200 per pagina, componente e moduli di acquisizione
  aggiornati su `http://127.0.0.1:5173`.
- Brave: pagina caricata, controlli Avvia/Arresta, sorgente e specchio presenti;
  stato iniziale Spenta con Arresta disabilitato. Accesso alla webcam fisica non
  attivato durante questa verifica.

La revisione C01 aggiunge verifiche automatiche del confine webcam/RGBA: copia,
proprietà del buffer, rilascio, errori, annullamento e trasferimento del buffer
con `structuredClone`. Nessuna prova manuale aggiuntiva viene eseguita dall'agente.

Questi controlli verificano il comportamento del software con API simulate.
Non certificano l'hardware, il prompt dei permessi o le prestazioni nel browser.

## Collaudo manuale da eseguire

1. Avviare il progetto con `npm.cmd run dev` e aprire `http://127.0.0.1:5173`.
2. Verificare che prima del clic non si accenda la webcam e non venga chiesto l'audio.
3. Premere **Avvia webcam**, consentire l'accesso e verificare anteprima, dimensioni
   e contatore; provare lo specchio senza modificare la sorgente.
4. Premere **Arresta** e verificare lo spegnimento della webcam e lo svuotamento
   dell'anteprima. Ripetere avvio/arresto almeno tre volte.
5. Cambiare fotocamera, se disponibile: la precedente deve fermarsi e la nuova
   deve richiedere il pulsante **Avvia**.
6. Passare a un'altra scheda o minimizzare il browser: al ritorno la camera deve
   essere spenta e lo stato deve spiegare l'interruzione.
7. Negare il permesso e verificare il messaggio; correggere manualmente i permessi
   nel browser e riprovare. Provare anche **Arresta** durante il prompt.
8. Scollegare la webcam o revocare il permesso durante l'anteprima e verificare
   arresto e messaggio. Ricaricare/chiudere la pagina verificando il rilascio.

Registrare browser, dispositivo e risultati prima di dichiarare T03 completato.

## Riferimenti API

- [getUserMedia e richieste di permesso](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [Callback dei frame video](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback)
- [Rilascio delle tracce](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/stop)
- [Visibilità della pagina](https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event)
