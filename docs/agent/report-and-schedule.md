# Report, proposta e decisione di Terra

Il flusso è disponibile nel runtime demo con provider `mock` oppure NVIDIA/Nemotron. Il backend di Emanuel e la dashboard di Fabrizio possono essere collegati successivamente tramite i provider in `server/agent/ports.ts`. Non vengono scritti dati nel backend Python.

## Comportamento

1. L'astronauta parla o scrive, verifica il check-in e sceglie cosa condividere, inclusa l'eventuale osservazione webcam.
2. Alla conferma vengono congelati sensori, osservazione visiva autorizzata e programma con la sua versione. I cambiamenti successivi non riscrivono il contesto della valutazione.
3. L'agent genera un report per Terra: dichiarazioni condivise, letture dei sensori con provenienza, discrepanze, incertezze e necessità di revisione umana. Le evidenze rimandano agli ID delle fonti autorizzate.
4. Se motivata, genera una proposta `PENDING_REVIEW`; altrimenti fornisce `noChangeReason`. Il programma rimane invariato. Una proposta che non supera il validatore viene scartata: il report resta disponibile e richiede revisione umana.
5. Solo Terra può approvare o rifiutare. Solo `APPLIED` significa che il programma è stato aggiornato. Una decisione ripetuta con la stessa chiave e lo stesso payload non applica due volte la variazione.

Il diario rimane privato. La webcam misura le chiusure delle palpebre nell'intervallo osservato: non misura ore di sonno e non dimostra da sola fatica o una diagnosi. Una misura sintetica o insufficiente è descritta nelle incertezze, non usata come evidenza di una proposta.

## Programma e limiti della demo

`DemoProgramProvider` salva il programma in Prisma e lo versiona. I programmi già presenti vengono conservati. Per una data senza programma crea una giornata illustrativa in UTC, dalle 06:00 alle 06:00 successive, con pasti, due blocchi di esercizio, collegamento con Terra e opportunità di sonno protetti. Due attività di missione sono spostabili entro finestre esplicite.

Il server consente soltanto una pausa positiva fino a 20 minuti prima di una singola attività futura di missione flessibile, spostata della stessa durata. Verifica finestre, durata, dipendenze, assenza di sovrapposizioni e attività bloccate. Richiede evidenze condivise sul riposo o sulla stanchezza: la visione da sola non basta. All'applicazione ricontrolla approvazione persistita, comando autorizzato, versione e tempo corrente; una finestra già iniziata non viene applicata.

Nel provider **mock** la regola riproducibile è: stanchezza riferita almeno 4/5 e sonno al massimo 6 ore, con fonti coerenti. La durata può essere riferita oppure provenire da un sensore di qualità `GOOD`. Una divergenza di almeno un'ora fra sensore e dichiarazione richiede chiarimento. Queste soglie e la pausa di 20 minuti sono scelte del prototipo, non regole cliniche o NASA. Nemotron valuta il contesto con le stesse restrizioni sulle modifiche, senza garantire una proposta a ogni check-in.

### Riferimenti NASA e loro uso

- [NASA, Medical Operations](https://www.nasa.gov/reference/6-0-medical-operations/): la pianificazione deve considerare ritmi circadiani, lavoro/riposo e carico delle attività.
- [NASA, giornata di lavoro sulla ISS](https://www.nasa.gov/missions/station/more-hands-make-light-work-crew-dragon-duo-increases-science-tempo-on-space-station/): descrive un esempio di giornata con esercizio obbligatorio e opportunità di sonno di 8,5 ore.
- [NASA, miglioramento del sonno degli astronauti](https://www.nasa.gov/missions/station/seven-ways-astronauts-improve-sleep-may-help-you-snooze-better-on-earth/): spiega l'uso di orari del sonno pianificati.

Queste fonti orientano le categorie protette. Gli orari esatti e il contenuto delle attività demo sono nostri esempi; non rappresentano una schedule ufficiale né un protocollo certificato.

## API per Emanuel e Fabrizio

Autenticazione `Authorization: Bearer <token>`. In demo usare `AGENT_DEMO_TOKEN` per l'astronauta e `AGENT_GROUND_TOKEN` distinto per Terra; entrambi definiti sul server. Ruoli e ambito non vengono letti dal body. Le credenziali del backend reale richiederanno un `IdentityProvider` dedicato.

| Metodo e percorso | Uso |
| --- | --- |
| `GET /api/agent/v2/reports?astronautId=astro-1` | Report condivisi, anche con evidenze webcam |
| `GET /api/agent/v2/proposals?astronautId=astro-1` | Proposte e stato; `cursor` e `limit` opzionali |
| `GET /api/agent/v2/schedule?astronautId=astro-1&date=2026-11-14` | Programma persistente della data richiesta |
| `POST /api/agent/v2/proposals/:id/decision` | Decisione di Terra |

Le risposte positive contengono `{ data, meta: { contractVersion: "2.0.0", requestId } }`, con `Cache-Control: no-store`. Schemi e tipi importabili dal frontend: `server/agent/contracts/index.ts`, inclusi `ProposalListV2ResponseSchema`, `DecisionV2ResponseSchema` e `ScheduleV2ResponseSchema`.

Esempio decisione:

```http
POST /api/agent/v2/proposals/<proposal-id>/decision
Authorization: Bearer <token-terra>
Content-Type: application/json
Idempotency-Key: decisione-univoca-1

{ "decision": "APPROVE", "comment": "Compatibile con le attività previste." }
```

Per rifiutare usare `REJECT`. `comment` è obbligatorio ma può essere `null`. La risposta contiene `{ decision, proposal, schedule }`: `schedule` è valorizzato soltanto per `APPLIED`. `REJECTED` non cambia il programma; una versione superata produce `409 VERSION_CONFLICT` e `STALE`. Un'approvazione con applicazione fallita restituisce lo stato `APPLY_FAILED`, senza presentarla come applicata. Un timeout non giustifica una seconda richiesta con una chiave diversa: ripetere la richiesta originale.

La conferma con scelta webcam usa `POST /api/agent/v2/check-ins/:id/confirm`; i messaggi continuano a usare le API di sessione esistenti. Per il dettaglio di conferma e consenso vedere [I1](./i1-vision-import.md) e lo schema `ConfirmCheckInWithVisionRequestSchema`.

## Setup e verifica

Con il server fermo, dopo aver aggiornato il codice:

```powershell
npm.cmd run db:generate
npm.cmd run db:push
npm.cmd run test:agent
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run dev
```

Lo schema aggiunge il campo opzionale `CheckInContextSnapshot.scheduleJson`. Non serve azzerare il database. Per check-in vecchi senza programma congelato, una nuova proposta richiede un nuovo check-in.

Per provare a mano senza API esterne impostare `AGENT_AI_PROVIDER=mock` e `AGENT_DEMO_SCENARIO=POOR_SLEEP` in `.env`, riavviare il server e aprire `/voice-demo`. Scrivere «Ho dormito 4.5 ore. Qualità del sonno 2 su 5. Stanchezza 4 su 5.», condividere le osservazioni e confermare. La proposta richiede un'attività futura eleggibile: dopo l'ultima attività flessibile è corretto ottenere un motivo di mancata variazione. La demo attuale non include una nuova schermata per la decisione: usare le API sopra.

Gli scenari riproducibili senza dipendere dall'ora reale sono in `tests/agent/planning-flow.test.ts`: database temporanei, orologio fissato prima delle attività, sonno scarso con proposta, riposo adeguato senza proposta, dati insufficienti, approvazione idempotente, rifiuto, permessi e versione obsoleta. `tests/agent/artifacts.test.ts` verifica inoltre che una raccomandazione non valida non elimini il report.

## Collegamento successivo

Con Emanuel va sostituita la lettura simulata dei sensori e concordata l'autorità della schedule, implementando `SensorProvider` e `ScheduleProvider`; il provider reale dovrà mantenere confronto di versione, idempotenza e ricevuta dell'applicazione. La dashboard di Fabrizio può già consumare i contratti sopra e mostrare report, motivazione, differenza prima/dopo e pulsanti riservati a Terra. La persistenza locale non sincronizza automaticamente il backend Python.
