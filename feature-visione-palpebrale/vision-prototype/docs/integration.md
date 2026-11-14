# Esportazione e integrazione — T05

La UI offre **Esporta JSON webcam** durante o dopo una misura e **Esporta JSON
sintetico** durante o dopo un replay. Il download è locale. Il risultato esportato
è l'istantanea mostrata al momento del clic, anche se l'inferenza ha già elaborato
altri fotogrammi non ancora visualizzati. Un'interruzione della webcam conserva
il profilo necessario a esportare l'ultima misura visualizzata.

## Schema `crewready-session-v2`

La revisione v2 aggiunge profili multipli con configurazione per identificativo,
stato applicativo, contesto webcam e campioni di prestazione. È distinta da v1;
i file già esportati in v1 rimangono invariati, ma il validatore v2 li rifiuta.

| Campo | Contenuto |
| --- | --- |
| `schemaVersion`, `contractVersion` | Versioni del pacchetto e dei contratti |
| `exportedAt` | Data UTC di esportazione, ISO 8601 |
| `source` | `webcam` con dispositivo, risoluzione e limiti, oppure `synthetic` con nome, versione e fingerprint della fixture |
| `units` | Tempo in millisecondi, apertura normalizzata, quote tra 0 e 1 |
| `clock`, `timeOriginUnixMs` | Orologio monotono e sua origine Unix per la webcam; tempo virtuale e `null` per le fixture |
| `calibration` | Profili e configurazioni effettive per identificativo per la webcam; identificativi sintetici e motivo dell'assenza di profili fisici per il replay |
| `inference` | Configurazione geometrica, modello, runtime, provenienza e checksum; `null` per replay sintetici |
| `snapshot` | Istantanea del motore completa, con configurazione, sessione, finestra, eventi, versioni e diagnostica |
| `samples` | Campioni nell'ordine offerto al motore, compresi eventuali rifiutati e motivi di invalidità |
| `performanceSamples` | Timestamp e latenza di inferenza per i frame elaborati durante la misura webcam |
| `application` | Fase, interruzione ed eventuale errore applicativo; `null` per il replay |
| `unavailable` | Motivi espliciti dei valori non disponibili: nessun intervallo, nessun tempo valido o nessun evento completo |

L'assenza di un valore resta `null`, distinta da uno zero misurato. La quota
`closureFraction` è la quota temporale sperimentale calcolata da N02. UI e
consumatore non ricalcolano durate o frazioni. Gli eventi in corso e quelli
incompleti conservano i campi originali del motore.

I campioni sintetici sono già normalizzati: gli identificativi di calibrazione
sono conservati, ma non rappresentano profili fisici. L'export non include immagini
o video. La configurazione MediaPipe include anche i percorsi locali degli asset;
la provenienza conserva versione e SHA-256 del modello. L'identificativo e il nome
del dispositivo sono inclusi se disponibili. Il fingerprint FNV-1a a 32 bit della
fixture identifica variazioni accidentali del contenuto, non è una firma di sicurezza.

## Consumatore separato

`src/integration/session-export.ts` non importa React o variabili globali della UI.
`createSessionExport` riceve il risultato e i relativi metadati, controlla che i
profili webcam siano risolvibili e crea un oggetto JSON indipendente. Il timestamp
di esportazione viene fornito dal chiamante. `summarizeExport` è un esempio di
consumatore che legge direttamente i valori del motore:

```ts
import { summarizeExport } from '../src/integration/session-export';
import { parseSessionExport } from '../src/integration/parse-session-export';

// `jsonText` contiene un pacchetto prodotto da questa versione dell'app.
const data = parseSessionExport(jsonText);
const summary = summarizeExport(data);
console.log(summary.coverage, summary.closureFraction, summary.validMs);
```

`parseSessionExport` valida versione, struttura, metadati, profili, limiti e
campioni, poi riesegue il motore e rifiuta un'istantanea incoerente. Accetta fino
a 50 milioni di caratteri e 18.000 campioni; supporta soltanto C01 v2 / session v2.
La verifica è sincrona e non autentica la provenienza del file.
`serializeSessionExport` rifiuta numeri non finiti e valori non serializzabili
invece di convertirli silenziosamente in `null`.

Per riprodurre il risultato, creare `TemporalEngine` con `snapshot.config`, chiamare
`start()`, offrire `samples` nell'ordine salvato e chiamare `stop()` solo se
`snapshot.status` è `stopped`. L'esportazione di un replay parziale conserva
solo i campioni già elaborati nell'istantanea mostrata. Non vengono conservati
fotogrammi o geometrie grezze: il file riproduce il motore temporale dai campioni
calibrati, non l'intera inferenza MediaPipe dal video.

## Verifica

`npm.cmd test` include `src/integration/session-export.test.ts`: round trip JSON
e riproduzione di tutte le fixture, replay parziali con campioni rifiutati,
risultati non disponibili, profilo webcam, provenienza, rifiuto di profili mancanti
e valori non serializzabili. `src/app/live-session.test.ts` verifica che il profilo
resti esportabile dopo lo stop. La prova manuale del download è a carico dell'utente.

## Prestazioni e limiti

La misura si arresta automaticamente a 18.000 campioni; tutti restano esportabili.
Il grafico è limitato a 2.000 punti e segnala quando viene semplificato. Il JSON
può comunque essere grande: contiene l'intera istantanea, tutti i campioni e le
latenze. `createSessionValidationReport` produce `n05-session-v1` con contesto e
statistiche; il confronto resta `null` finché non vengono fornite annotazioni.
