# Contratti Agent v1 — base di lavoro C0

Stato: **contratto locale implementato e verificabile; integrazione esterna da confermare con Fabrizio**.
Versione del contratto: `1.0.0`. Prefisso HTTP previsto: `/api/agent/v1`.

Questo documento definisce gli accordi di implementazione. Gli schemi eseguibili sono in `server/agent/contracts/`; le interfacce server sono in `server/agent/ports.ts`. T1 implementa ora apertura/lettura delle sessioni e invio messaggi: vedere la [guida T1](t1-conversation.md). Le altre route del catalogo restano da implementare nei rispettivi task.

## Uso dei contratti

```ts
import { SendMessageRequestSchema } from "@/server/agent/contracts";
import type { SendMessageRequest, ScheduleProposal } from "@/server/agent/contracts";
import type { AiProvider } from "@/server/agent/ports";

const result = SendMessageRequestSchema.safeParse(untrustedJson);
if (!result.success) {
  // La futura route converte gli errori in ApiError, senza esporre il payload.
}
```

Il barrel `contracts/index.ts` e utilizzabile dal frontend: non importa Prisma, Next.js, SDK AI, filesystem o variabili d'ambiente. `ports.ts` viene usato dalle implementazioni server. I tipi derivano dagli schemi Zod, senza DTO duplicati a mano.

Gli oggetti sono strict: campi sconosciuti sono rifiutati. Non avvengono conversioni automatiche da stringhe a numeri. L'adattatore HTTP converte esplicitamente il parametro query `limit` prima della validazione.

## Decisioni fissate per il MVP

| Aspetto | Accordo |
| --- | --- |
| Identificativi | Stringhe opache di 1–128 caratteri alfanumerici, trattino e underscore; primo carattere alfanumerico |
| Tempo | Timestamp ISO 8601 UTC con `Z`; data `YYYY-MM-DD`; fuso IANA esplicito nel programma |
| Versioni | Interi positivi; `revision` per check-in/diario, `version` per programma |
| Lingua voce | Italiano (`it`); testo sempre disponibile |
| Qualita sonno | Scala dichiarata 1 = molto scarsa, 5 = molto buona |
| Stanchezza | Scala dichiarata 1 = assente/minima, 5 = molto elevata |
| Dati mancanti | Osservazione assente dall'array, mai valore o scala inventati |
| Metriche simulate | Ore di sonno (`h`), numero di risvegli (`count`), frequenza cardiaca a riposo (`bpm`) |
| Qualita sensori | `GOOD`, `DEGRADED`, `UNAVAILABLE`; soltanto `UNAVAILABLE` richiede `value: null` |
| Scenari | `RESTED`, `POOR_SLEEP`, `CONFLICTING_DATA`; scelta interna alla demo, non un campo delle API di produzione |
| Programma | Singolo astronauta per snapshot; tutte le attivita MVP sono esclusive, senza sovrapposizioni |
| Operazioni | `MOVE_ACTIVITY` e `ADD_REST`; niente cancellazione, accorciamento o modifica delle priorita |
| Test | Runner integrato `node:test`, eseguito con `tsx`; comando `npm run test:agent` |
| Dipendenze nuove | Zod per validazione runtime; `tsx` era gia previsto dal progetto |

I limiti numerici degli schemi sono limiti di formato del prototipo, non soglie mediche. Non si deducono scale numeriche dal termine «male»: l'agent chiede la scala o lascia il dato assente.

Input fissati per i futuri simulatori di N1 (stesso programma di `examples/normal.json`):

| Scenario | Sensori: ore / risvegli / bpm | Dichiarazione: ore / qualita / stanchezza | Aspettativa funzionale |
| --- | --- | --- | --- |
| `RESTED` | 8 / 1 / 60 | 8 / 4 / 1 | Nessuna proposta forzata; motivazione esplicita se il programma resta invariato |
| `POOR_SLEEP` | 4.8 / 6 / 72 | 4.5 / 2 / 4 | Candidato dimostrativo pausa + spostamento dell'inventario, comunque da validare e approvare |
| `CONFLICTING_DATA` | 8 / 1 / 60 | 4 / 2 / 4 | Conservare entrambi i valori del sonno, chiedere chiarimenti, riportare la discrepanza senza assumere quale sia corretto |

Questi input sono riproducibili; le risposte del provider AI reale possono variare. L'adattatore AI simulato puo restituire risultati fissi per verificare il percorso completo. La frequenza cardiaca dei tre scenari non e una soglia di intervento.

## Informazioni personali e report operativo

Un'osservazione del check-in ha ID, campo, valore, origine `self_report`, timestamp e riferimenti ai messaggi dell'astronauta. I campi ammessi sono `SLEEP_HOURS`, `SLEEP_QUALITY`, `FATIGUE`, `PHYSICAL_NOTES`; massimo un'osservazione per campo. La correzione mantiene l'identita dell'osservazione e incrementa la revisione del check-in.

La conferma include gli ID delle sole osservazioni che l'astronauta accetta di condividere. Anche una selezione vuota e valida. La selezione deve appartenere alla bozza corrente e non puo essere cambiata dopo la conferma nel MVP. Una successiva correzione delle informazioni condivise richiede un nuovo check-in; un futuro flusso di rettifica e fuori da questa versione.

Il servizio costruisce `SharedCheckIn` con la selezione confermata e rimuove i riferimenti ai messaggi. Il provider che genera report e proposte riceve soltanto questa proiezione, i sensori e il programma. Non riceve diario, trascrizione integrale o osservazioni escluse. Le osservazioni private non possono comparire neppure nelle motivazioni delle proposte visibili a Terra.

Le evidenze operative sono riferimenti a letture dei sensori o osservazioni condivise; non contengono frasi private copiate dai messaggi. Una deduzione usa `source: inference` ed esplicita le evidenze. Non e un dato misurato ne una diagnosi.

Il diario e sempre `PRIVATE`, separato dal report e correggibile con controllo della revisione. L'audio grezzo non viene persistito. La politica temporale di conservazione dei dati testuali andra concordata prima di usare dati reali.

## Vincoli del programma

Lo snapshot include finestra della giornata, versione e attivita con orari, priorita, flag `movable`, dipendenze e finestra consentita. Gli schemi controllano il formato e gli intervalli elementari; il futuro `ScheduleValidator` deve controllare i vincoli tra le attivita e le evidenze.

Regole obbligatorie del validatore:

1. Le attivita citate esistono nello snapshot dell'astronauta e gli ID inseriti sono nuovi.
2. Attivita con `movable: false` o priorita `CRITICAL` non possono essere spostate.
3. Uno spostamento preserva la durata e resta nella finestra consentita.
4. Le dipendenze esistono, non formano cicli e terminano prima dell'attivita dipendente.
5. Il risultato non contiene sovrapposizioni e resta nei limiti della giornata.
6. `ADD_REST` crea un'attivita `REST`, priorita `LOW`, spostabile, senza dipendenze, con finestra pari alla giornata.
7. La proposta cita solo sensori del contesto e osservazioni condivise del check-in confermato.
8. La versione di partenza corrisponde a quella corrente prima della decisione e dell'applicazione.

Il candidato dell'AI non contiene autorizzazioni, stato della proposta o decisioni. Il servizio assegna ID e stato solo dopo averlo validato. Se la proposta non e valida, non viene pubblicata a Terra; il fallimento viene gestito esplicitamente, senza applicare una correzione silenziosa.

Gli esempi in `examples/normal.json` fissano un programma minimo: collegamento Terra immutabile 08:00–08:30 UTC, inventario flessibile 09:00–09:40. La proposta sposta l'inventario alle 09:20–10:00 e inserisce una pausa 09:00–09:20. E uno scenario dimostrativo, non una prescrizione.

## Identita e permessi

`IdentityProvider` restituisce un'identita verificata sul server:

- `ASTRONAUT`: `userId` e un solo `astronautId`.
- `GROUND_CONTROL`: `userId` e lista esplicita degli astronauti autorizzati.

Il client non puo inviare `role` o `operatorId` nel body. `operatorId` della decisione deriva dall'identita verificata. L'ID astronauta nelle query non attribuisce permessi: il servizio verifica sempre lo scope.

Le sessioni, i messaggi, il check-in completo e il diario sono accessibili soltanto al relativo astronauta. Terra accede a proposte, decisioni e report dei soli astronauti autorizzati. La visibilita dei sensori nella dashboard verra gestita dal relativo modulo, non da un accesso alla conversazione privata.

Autenticazione assente: 401. Ruolo non ammesso: 403. Risorsa inesistente o appartenente a un altro astronauta: 404. Le simulazioni di identita sono ammesse soltanto in sviluppo e devono fallire in avvio se abilitate in produzione.

L'accordo concreto sul sistema di login di Fabrizio resta esterno a C0: l'interfaccia e gia definita e consente lo sviluppo con un adattatore locale.

## API HTTP

`AGENT_ENDPOINTS` in `contracts/endpoints.ts` e il catalogo eseguibile di metodi, percorsi, ruoli e schemi. Tutte le risposte JSON positive usano:

```json
{
  "data": {},
  "meta": { "contractVersion": "1.0.0", "requestId": "request-1" }
}
```

| Metodo e percorso relativo | Body / query | Risposta positiva |
| --- | --- | --- |
| `POST /sessions` | `{ astronautId }` | 201, sessione |
| `POST /sessions/:id/messages` | `{ clientMessageId, text, inputMode }` | 200, messaggio astronauta, risposta assistant, bozza check-in |
| `GET /sessions/:id` | `beforeMessageId?` | 200, stato della sessione |
| `PATCH /check-ins/:id` | `{ expectedRevision, observations }` | 200, bozza aggiornata |
| `POST /check-ins/:id/confirm` | `{ expectedRevision, sharedObservationIds }` | 202, stato della sessione e generazione |
| `GET /proposals` | `astronautId`, `cursor?`, `limit?` | 200, pagina di proposte |
| `POST /proposals/:id/decision` | `{ decision, comment }` + `Idempotency-Key` | 200, decisione, proposta e programma applicato oppure `null` |
| `GET /reports` | `astronautId`, `cursor?`, `limit?` | 200, pagina di report |
| `GET /diary` | `astronautId`, `cursor?`, `limit?` | 200, pagina di diario privato |
| `PATCH /diary/:id` | `{ expectedRevision, text, status }` | 200, voce aggiornata |
| `POST /voice/transcriptions` | multipart: `audio`, `sessionId`, `durationSeconds` | 200, `{ text, language }` |
| `POST /voice/speech` | `{ sessionId, messageId }` | 200, binario `audio/mpeg` |

`PATCH /check-ins/:id` sostituisce l'intero array di osservazioni della bozza; non modifica altri campi. Il servizio verifica che ID e riferimenti ai messaggi appartengano a questa sessione e mantiene la provenienza anche per le correzioni manuali. Una modifica successiva alla conferma restituisce `INVALID_STATE`.

Le pagine usano `{ items, nextCursor }`, ordinamento stabile per data di creazione discendente e ID come spareggio, limite predefinito 20 e massimo 100. Il cursore e l'ID dell'ultimo elemento restituito. I messaggi di sessione sono paginati a gruppi di massimo 200, restituiti in ordine cronologico all'interno della pagina; `nextMessageCursor` permette di caricare la pagina precedente. Nessun contenuto privato entra nei parametri di URL.

Una sessione MVP accetta messaggi finche il check-in e in bozza; dopo la conferma si apre una nuova sessione. Questo evita di cambiare il contesto di un report gia confermato. Il diario e accessibile e modificabile anche in seguito.

### Conferma e generazione asincrona

La conferma restituisce 202 senza attendere il modello. `GET /sessions/:id` espone `generationStatus`: `NOT_STARTED`, `PROCESSING`, `READY`, `FAILED`.

Con `READY`, report e diario esistono sempre. Se `proposal` e `null`, `noChangeReason` deve spiegare l'assenza di variazioni. Durante `PROCESSING` un valore `null` non significa che l'agent abbia deciso di non intervenire. L'interfaccia puo effettuare polling ogni 2 secondi, interrompendolo su `READY` o `FAILED`.

La conferma identica puo essere ripetuta per recuperare lo stato e, con generazione fallita o lease scaduta, richiedere un nuovo tentativo. La selezione originale e la revisione inviata devono coincidere con la prima conferma. Il repository acquisisce una lease di generazione ed effettua il salvataggio atomico degli artefatti una sola volta per check-in. Un worker con lease scaduta non puo pubblicare risultati.

### Errori

Ogni errore JSON usa `ApiErrorSchema`. `ERROR_HTTP_STATUS` definisce la corrispondenza tra codice applicativo e codice HTTP. `issues` puo essere vuoto; non deve includere valori personali. `requestId` consente di correlare log tecnici privi di trascrizioni.

Esempio completo di conflitto: `examples/stale.json`, HTTP 409 `VERSION_CONFLICT`, con `currentVersion`. Una nuova proposta richiede una nuova approvazione; ritentare la vecchia non risolve il conflitto.

## Decisione, applicazione e retry

```text
PENDING_REVIEW -> REJECTED
PENDING_REVIEW -> APPROVED -> APPLIED
PENDING_REVIEW -> STALE
APPROVED      -> STALE | APPLY_FAILED
APPLY_FAILED  -> APPLIED | STALE
```

1. Terra invia `APPROVE` o `REJECT` con una chiave di idempotenza stabile per quell'azione.
2. Il servizio verifica identita, scope, stato e versione del programma.
3. Se gia obsoleta, marca la proposta `STALE` e risponde 409 senza registrare un'approvazione nuova.
4. Altrimenti registra decisione e stato in transazione. La decisione e immutabile.
5. Solo per `APPROVE` invoca `ScheduleProvider.applyApproved` attraverso un confine server fidato; il provider verifica la decisione autorizzata e controlla nuovamente la versione nella stessa transazione della modifica.
6. Registra l'esito. Se una modifica concorrente interviene dopo la decisione, la decisione rimane nell'audit e la proposta diventa `STALE`.

Chiave riutilizzata con payload o operatore differente: 409 `IDEMPOTENCY_CONFLICT`. Decisione incompatibile con quella gia registrata: 409 `INVALID_STATE`. Una ripetizione identica restituisce la decisione originale e lo stato corrente, senza nuovi effetti. La chiave e associata a proposta, operatore e payload normalizzato.

L'adattatore del programma deduplica per `proposalId`/`decisionId`, confrontando anche il comando: un comando diverso con la stessa coppia e un conflitto. Il controllo della versione, la scrittura e la ricevuta duratura devono essere atomici nel sistema autorevole del programma.

Esiti dell'adattatore: `APPLIED`, `STALE`, `FAILED`, `UNKNOWN`. Un timeout dopo un possibile invio produce `UNKNOWN`: la proposta resta `APPROVED`, l'interfaccia mostra applicazione in verifica e il servizio riconcilia tramite `getApplication`. Non si marca `APPLY_FAILED` quando l'esito e soltanto sconosciuto. `FAILED` e riservato a un fallimento certo.

Un retry di applicazione usa sempre la stessa decisione e lo stesso comando, riconcilia prima l'esito e non scavalca i vincoli di versione. Per il MVP puo essere attivato ripetendo la stessa richiesta di decisione. Il servizio non mantiene transazioni SQLite aperte durante chiamate esterne.

Con `APPLIED`, `DecisionResult.schedule` contiene il programma aggiornato e `appliedScheduleVersion` e valorizzato. Negli altri stati `schedule` e `null`; la lettura del programma corrente resta responsabilita del sistema del programma. Soltanto `APPLIED` consente di annunciare all'astronauta che la variazione e effettiva.

## Voce

Registrazione a turni: registra, trascrivi, mostra testo correggibile, invia tramite la stessa API messaggi con `inputMode: VOICE`. Non si inviano messaggi due volte al termine della trascrizione.

Limiti: 10 MiB, 120 secondi, timeout provider 30 secondi. MIME ammessi: `audio/webm`, `audio/webm;codecs=opus`, `audio/mp4`, `audio/wav`, `audio/mpeg`. La route ricava MIME e dimensione dal file e verifica il contenuto e la durata effettiva; la durata dichiarata dal client non e autorevole. Un provider incapace di gestire il formato deve convertirlo lato server oppure rispondere con `UNSUPPORTED_AUDIO`.

La sintesi puo leggere soltanto messaggi `ASSISTANT` della sessione dell'astronauta. Output HTTP `audio/mpeg`, `Cache-Control: no-store`; eventuale formato diverso del provider viene convertito dall'adattatore. Non e un endpoint pubblico per sintetizzare testo arbitrario. Le risposte audio positive non hanno envelope JSON; gli errori si.

## File di esempio e verifiche

- `examples/normal.json`: richieste, dati contestuali, proposta, decisione, report e diario di un percorso con variazione.
- `examples/normal-response.json`: risposta HTTP positiva dopo l'applicazione della variazione.
- `examples/no-change.json`: risposta di stato `READY` senza proposta, con motivazione esplicita.
- `examples/stale.json`: errore HTTP 409 per proposta obsoleta.

I test devono validare questi esempi contro gli schemi e rifiutare input ambigui: ruolo nel body, scale fuori intervallo, sensori con unita sbagliata, contenuti privati nel contesto operativo, metadati di applicazione incoerenti. Questi sono test dei confini condivisi; i test di transazioni e autorizzazione effettiva spettano a N1/N2.

```text
npm ci
npm run test:agent
npm run typecheck
npm run lint
```

In PowerShell, se la policy impedisce l'esecuzione di `npm.ps1`, usare `npm.cmd` negli stessi comandi. Il lint esclude il file generato `next-env.d.ts`, che non va modificato manualmente.

## Consegna e responsabilita

- Tu: implementi `AiProvider`, `VoiceProvider`, orchestrazione, report/diario e demo usando questi contratti.
- Nello: implementa repository, validatore, provider simulati e ciclo di approvazione usando `ports.ts`.
- Nello resta referente delle modifiche condivise a contratti e dipendenze dopo questa base iniziale; concordare ogni modifica incompatibile prima di integrarla.
- Fabrizio: collega la dashboard alle API e concorda adattatori di identita e programma; nessun componente grafico della demo e obbligatorio.

Da confermare con Fabrizio: login effettivo, proprietario del programma autorevole e relativo meccanismo transazionale. Provider AI/voce e conservazione temporale dei dati reali saranno scelti prima delle rispettive implementazioni; non modificano i DTO di questa versione.

Riferimento della libreria di validazione: [documentazione ufficiale Zod](https://zod.dev/basics).
