# T2: report operativo e diario personale

Il check-in confermato avvia due generazioni separate: il report per Terra riceve soltanto le osservazioni selezionate dall'astronauta e i sensori simulati; il diario riceve la conversazione privata. Il diario e modificabile soltanto dall'astronauta. Report e diario sono salvati una sola volta per check-in nel database SQLite.

## Configurazione locale

In `.env` impostare `AGENT_DEMO_ENABLED=true`, `AGENT_DEMO_TOKEN`, `AGENT_GROUND_TOKEN` (distinto e di almeno 16 caratteri), `AGENT_AI_PROVIDER=nvidia`, `NVIDIA_API_KEY` e, facoltativamente, `NVIDIA_MODEL`. I due token locali autenticando rispettivamente astronauta e sala di controllo non devono essere condivisi nel frontend. Nel file locale gia predisposto per questa demo entrambi i token sono stati generati.

Inizializzare il database con `npm run db:push`, poi avviare `npm run dev`. Il comando `db:seed` cancella tutti i dati dimostrativi: non e necessario per T2. Il runtime usa Prisma e i provider di sensori e programma dimostrativi.

## Flusso API

1. `POST /api/agent/v1/sessions` e `POST /sessions/:id/messages` creano il check-in in bozza.
2. `PATCH /check-ins/:id` permette di correggere le osservazioni con `expectedRevision`.
3. `POST /check-ins/:id/confirm` riceve `{ "expectedRevision": 1, "sharedObservationIds": ["id-osservazione"] }`. Solo gli ID selezionati entrano nel contesto operativo. La risposta e 202.
4. `GET /sessions/:id` mostra `generationStatus`: `NOT_STARTED` (l'avvio asincrono puo essere ancora in corso), `PROCESSING`, `READY` o `FAILED`. Si puo ripetere la stessa conferma per ritentare una generazione fallita; report e diario non vengono duplicati.
5. `GET /reports?astronautId=astro-1` restituisce il report all'astronauta o alla sala di controllo autorizzata.
6. `GET /diary?astronautId=astro-1` e `PATCH /diary/:id` sono riservati all'astronauta. La modifica richiede `expectedRevision`, `text` e `status` (`DRAFT` o `CONFIRMED`).

I percorsi sono relativi a `/api/agent/v1`. Le credenziali vanno nell'header `Authorization: Bearer ...`; le risposte private sono `Cache-Control: no-store`. Un token Terra e limitato allo scope demo `astro-1` e non puo leggere il diario. Il modello non riceve trascrizione o osservazioni non condivise durante la generazione del report. Le evidenze sono controllate prima del salvataggio; il diario rimane una bozza correggibile.

Per ripetere il collaudo con dati fittizi, avviare il server e, in un secondo terminale:

```powershell
npm.cmd run test:agent:t2:live
```

Se il server usa la porta 3101: `npm.cmd run test:agent:t2:live -- --base-url http://127.0.0.1:3101`. Il test usa la quota NVIDIA e lascia una sessione fittizia nel database; non stampa le credenziali. La suite senza chiamate live e `npm.cmd run test:agent`.

## Limiti attuali

- La generazione T2 usa NVIDIA oppure il provider simulato. Il provider OpenAI implementa soltanto la conversazione.
- La generazione asincrona viene avviata nel processo Next locale. Dopo un riavvio durante la generazione, attendere la scadenza della lease e ripetere la stessa conferma; per un deployment distribuito serve una coda persistente.
- Il programma nel runtime resta simulato e in sola lettura: il report non genera proposte di modifica. I servizi N2 di validazione e approvazione esistono, ma non sono ancora collegati alle API e al programma autorevole.
- Il report generato e verificato per formato e riferimenti, ma richiede revisione umana per accertare l'accuratezza del testo. Il diario e sempre una bozza modificabile.
