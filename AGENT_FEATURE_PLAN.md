# Assistente AI di bordo: specifica e piano di implementazione

## Obiettivo

Realizzare un assistente vocale con cui l'astronauta possa parlare del sonno, delle condizioni fisiche e della propria giornata. L'assistente combina quanto riferito con dati di sensori simulati e con il programma definito da Terra, produce un report operativo e un diario e, quando opportuno, propone una variazione del programma.

La variazione diventa effettiva soltanto dopo l'approvazione della sala di controllo e la conferma dell'applicazione da parte del sistema che gestisce il programma.

Il modulo deve essere utilizzabile senza la dashboard di Fabrizio. La sua dashboard verra collegata successivamente attraverso API e contratti condivisi, senza riscrivere la logica dell'agent.

## Contesto della repo

- Next.js App Router, React e TypeScript.
- Prisma con SQLite, attualmente senza modelli applicativi.
- Cartelle `server/` e `components/` ancora vuote.
- Nessuna integrazione AI o vocale implementata.
- `db:seed` fa riferimento a `prisma/seed.ts`, che deve ancora essere creato.

Il lavoro riguarda la funzionalita dell'agent e una pagina tecnica di prova. La dashboard di prodotto resta in carico a Fabrizio.

## Esperienza prevista

1. L'astronauta avvia una conversazione testuale o vocale.
2. L'agent recupera sensori, programma e check-in precedenti autorizzati.
3. L'astronauta descrive il riposo e come si sente; l'agent chiede chiarimenti quando servono.
4. L'agent prepara un check-in strutturato, correggibile dall'astronauta.
5. Dopo la conferma del check-in, genera un report operativo e una bozza del diario; puo anche generare una proposta di variazione.
6. Il backend valida la proposta rispetto ai vincoli del programma.
7. Terra legge motivazione, evidenze e confronto prima/dopo e approva oppure rifiuta.
8. Se approvata e ancora valida, il sistema applica la variazione e ne registra l'esito.
9. L'astronauta riceve una conferma coerente con lo stato reale.

Esempio dimostrativo: l'astronauta riferisce sonno frammentato e stanchezza; l'agent approfondisce, propone di spostare un'attivita flessibile e inserire una pausa compatibile con il programma; Terra approva e la nuova versione del programma viene restituita alle due viste.

## Perimetro del primo MVP

Incluso:

- Un astronauta dimostrativo, una giornata e un programma iniziale definito da Terra.
- Tre scenari di sensori riproducibili.
- Conversazione testuale e successiva aggiunta di input/output vocale in italiano.
- Check-in strutturato con conferma o correzione.
- Proposta facoltativa, validazione e approvazione/rifiuto da Terra.
- Persistenza di messaggi, check-in, proposte, decisioni, report e diario.
- Memoria limitata a un numero configurabile di messaggi e check-in precedenti autorizzati.
- Pagina `/agent-demo` indipendente dalla dashboard di Fabrizio.
- Contratto API ed esempi per l'integrazione.

Rimandato:

- Dashboard definitiva e integrazione con sensori reali.
- Conversazione audio continua con interruzioni e streaming in tempo reale.
- Ottimizzazione automatica dell'intero programma di missione.
- Sistema con piu agent, database vettoriale e addestramento di modelli.
- Diagnosi, prescrizioni o affermazioni di efficacia clinica.
- Funzionamento del modello AI completamente offline; nel MVP un errore di rete viene gestito esplicitamente.

## Principi di implementazione

### Dati e interpretazione

- Distinguere sempre `sensor`, `self_report` e `inference` come origine delle informazioni.
- Conservare timestamp, unita di misura e riferimenti alle evidenze.
- Non sostituire una dichiarazione dell'astronauta con una misura discordante, o viceversa.
- Se un dato manca, registrarlo come assente; non inventare valori.
- Usare scenari e soglie esplicitamente dimostrativi, non presentati come criteri clinici.
- Non dedurre diagnosi o stati psicologici certi dal testo o dal tono della voce.
- In presenza di elementi che richiedono valutazione umana, produrre una segnalazione dedicata; non trattare ogni problema come una semplice modifica di orario.

### Autorita sul programma

- L'agent puo leggere il programma e creare proposte; non dispone di uno strumento per applicarle o approvarle.
- Il codice controlla sovrapposizioni, attivita bloccate, dipendenze, durata e limiti della giornata.
- Ogni proposta contiene la versione del programma da cui deriva.
- Un'approvazione non equivale a un aggiornamento gia applicato.
- L'applicazione richiede un controllo atomico della versione e deve essere idempotente.
- Se il programma e cambiato, la proposta diventa obsoleta e deve essere rigenerata e nuovamente approvata.
- Una volta in attesa di decisione, il contenuto della proposta e immutabile; una revisione crea una nuova proposta.

### Compagnia, diario e condivisione

- L'agent si presenta come assistente artificiale e incoraggia i contatti umani.
- Diario personale e report operativo sono oggetti distinti.
- Il diario e privato per impostazione predefinita e non e leggibile dalle API di Terra.
- La conversazione completa e privata per impostazione predefinita: il contesto personale non viene trasferito automaticamente nel report.
- Il check-in confermato identifica le informazioni operative condivisibili; Terra legge il report derivato da quelle informazioni, non la trascrizione integrale.
- Prima della conferma, l'astronauta puo verificare e correggere i dati estratti.
- Per il MVP non si conserva l'audio grezzo; si salvano soltanto i dati testuali necessari al flusso. Non includere conversazioni o dati sensibili nei log tecnici.

## Architettura proposta

```text
server/agent/
  contracts/           Schemi validati e tipi pubblici
  core/                Orchestrazione della conversazione
  prompts/             Istruzioni e formati di estrazione
  services/            Check-in, proposte, report e diario
  adapters/            AI, voce, Prisma, sensori e programma
  simulator/           Scenari riproducibili

app/api/agent/         Route HTTP sottili
app/agent-demo/        Pagina tecnica di prova
components/agent-demo/ Componenti della sola demo
docs/agent/            Contratto API ed esempi di integrazione
prisma/               Schema e seed dimostrativo
```

Il nucleo del modulo non importa componenti React, oggetti request/response di Next.js o il client Prisma. Le route si occupano di autenticazione, validazione e conversione HTTP; gli adattatori gestiscono i servizi esterni e la persistenza.

Interfacce principali:

| Interfaccia | Responsabilita |
| --- | --- |
| `AiProvider` | Risposta conversazionale e output strutturato validato |
| `VoiceProvider` | Trascrizione audio e sintesi della risposta |
| `SensorProvider` | Letture disponibili per astronauta e intervallo |
| `ScheduleProvider` | Lettura del programma e applicazione autorizzata con versione attesa |
| `AgentRepository` | Persistenza di sessioni e risultati del modulo |
| `IdentityProvider` | Identita e ruolo verificati sul server |

Gli adattatori simulati permettono di sviluppare senza chiavi AI. Le credenziali reali sono lette sul server da variabili d'ambiente e non vengono inviate al browser. I tipi pubblici devono poter essere importati senza trascinare dipendenze server nel frontend.

### Confine con il programma di Fabrizio

Nel MVP `ScheduleProvider` usa il programma simulato. Durante l'integrazione verra sostituito con l'implementazione concordata con Fabrizio.

L'operazione di applicazione riceve `proposalId`, `decisionId`, `expectedScheduleVersion` e le modifiche validate. Il gestore autorevole del programma deve controllare la versione e impedire l'applicazione duplicata nella stessa transazione. L'agent registra l'esito confermato e puo riconciliarlo per identificativo dopo un timeout, senza presumere che l'operazione sia fallita o riuscita.

## Contratti dati minimi

| Oggetto | Campi principali |
| --- | --- |
| `SensorReading` | ID, astronauta, timestamp, metrica, valore, unita, qualita, scenario |
| `ScheduleSnapshot` | ID, astronauta, data, fuso orario, versione, attivita |
| `ScheduleActivity` | ID, inizio/fine, titolo, priorita, spostabile, dipendenze e vincoli |
| `ConversationSession` | ID, astronauta, apertura/chiusura |
| `ConversationMessage` | ID, sessione, ruolo, testo, timestamp, origine testo/voce |
| `CheckIn` | ID, sessione, stato bozza/confermato, sonno riferito, qualita, stanchezza, fastidi, evidenze e dati mancanti |
| `ScheduleProposal` | ID, check-in, versione di partenza, modifiche, motivazione, evidenze, stato |
| `ProposalDecision` | ID, proposta, approvazione/rifiuto, operatore, timestamp, commento |
| `GroundReport` | ID, check-in confermato, sintesi operativa, discrepanze, incertezze, proposta associata |
| `DiaryEntry` | ID, astronauta, data, testo, stato bozza/confermato, visibilita privata |

I campi soggettivi non hanno valori precompilati. Le eventuali scale, per esempio da 1 a 5, vengono definite nei contratti e spiegate all'astronauta prima di utilizzarle.

Usare timestamp ISO 8601 in UTC e un fuso esplicito nel programma. Concordare gli enum e il formato degli errori prima di sviluppare i due rami di lavoro.

### Stati delle proposte

```text
PENDING_REVIEW -> REJECTED
PENDING_REVIEW -> APPROVED -> APPLIED
PENDING_REVIEW -> STALE
APPROVED      -> STALE
APPROVED      -> APPLY_FAILED
APPLY_FAILED  -> APPLIED       (solo retry della stessa operazione, se ancora valida)
APPLY_FAILED  -> STALE
```

Una proposta non valida viene scartata prima di entrare in `PENDING_REVIEW`. Solo `APPLIED` autorizza il messaggio «Il programma e stato aggiornato». Una decisione ripetuta non deve creare nuovi effetti; una decisione incompatibile con quella gia registrata restituisce conflitto.

## API da concordare nella prima attivita

Prefisso proposto: `/api/agent/v1`. Il contratto definitivo deve includere esempi JSON completi, ruoli, codici HTTP ed errori.

| Metodo e percorso | Utilizzo |
| --- | --- |
| `POST /sessions` | Apre una sessione per l'astronauta autorizzato |
| `POST /sessions/:id/messages` | Invia testo; restituisce risposta, bozza del check-in e stato |
| `GET /sessions/:id` | Recupera lo stato della propria sessione |
| `PATCH /check-ins/:id` | Corregge una bozza |
| `POST /check-ins/:id/confirm` | Conferma i dati condivisibili e avvia la produzione dei risultati |
| `GET /proposals` | Elenca proposte visibili all'identita corrente |
| `POST /proposals/:id/decision` | Registra una decisione di Terra e tenta l'applicazione se approvata |
| `GET /reports` | Recupera report autorizzati per Terra o per il relativo astronauta |
| `GET /diary` | Recupera il diario del solo astronauta autenticato |
| `PATCH /diary/:id` | Corregge o conferma una voce del proprio diario |
| `POST /voice/transcriptions` | Converte audio in testo, da inviare poi alla normale API messaggi |
| `POST /voice/speech` | Produce l'audio di una risposta autorizzata dell'agent |

Le API vocali usano gli stessi servizi del percorso testuale. Definire formati audio ammessi, dimensione/durata massime, timeout e formato della risposta. La sintesi riceve un riferimento a un messaggio accessibile, non testo arbitrario da altri utenti.

Il ruolo non viene accettato dal corpo della richiesta. Una identita simulata puo essere usata nella sola demo locale, abilitata esplicitamente e disabilitata in produzione. La pagina demo non costituisce un sistema di autenticazione.

Per il MVP sono sufficienti richieste HTTP e aggiornamento tramite polling; streaming ed eventi push sono estensioni successive. L'API di stato deve consentire di recuperare il risultato dopo timeout o ricaricamento della pagina.

## Divisione del lavoro

Assegnazione proposta: **tu segui conversazione AI, voce e demo; Nello segue dati, programma, proposte e approvazione**. I contratti vengono definiti insieme prima di procedere in parallelo. Fabrizio gestisce la dashboard finale.

### C0 — Contratti e accordi iniziali — Tu + Nello

- [x] Definire schemi di input/output, enum, errori e interfacce degli adattatori.
- [x] Definire le informazioni condivisibili nel check-in e quelle private.
- [x] Definire il formato del programma, i vincoli e le operazioni ammesse nel MVP.
- [x] Preparare esempi JSON per percorso normale, nessuna proposta e proposta obsoleta.
- [ ] Concordare con Fabrizio il confine di integrazione per identita e programma, senza bloccare lo sviluppo degli adattatori simulati.
- [x] Scegliere il runner dei test e aggiungere uno script comune per i test del modulo.
- [x] Assegnare un referente unico per le modifiche a `contracts/` e `package.json`: Nello nella fase iniziale.

Base tecnica disponibile: [Contratti v1](docs/agent/contracts-v1.md), schemi in `server/agent/contracts/`, interfacce in `server/agent/ports.ts`, esempi in `docs/agent/examples/`. Le route HTTP e gli adattatori sono contratti da implementare nei task successivi. Il confronto con Fabrizio resta da svolgere: non e stato assunto un accordo esterno.

Completato quando entrambi possono implementare usando gli stessi esempi e le stesse firme, senza dipendere dal lavoro interno dell'altro.

### T1 — Conversazione testuale e provider AI — Tu

Dipendenza: C0.

- [x] Implementare `AiProvider`, un adattatore simulato e uno reale configurabile.
- [x] Implementare l'orchestratore con contesto limitato e autorizzato.
- [x] Scrivere le istruzioni per conversazione, chiarimenti ed estrazione del check-in.
- [x] Validare l'output strutturato del modello; gestire output invalido e timeout senza creare proposte malformate.
- [x] Gestire informazioni mancanti, dati discordanti e il caso in cui non serva alcuna modifica.
- [x] Esporre le API di sessione e messaggi usando le interfacce di persistenza concordate.

Implementazione e prova: [Guida T1](docs/agent/t1-conversation.md). Gli adattatori implementano la capability `ConversationAiProvider`; report e diario restano a T2. Il bootstrap usa memoria temporanea e dati dimostrativi sostituibili con N1. In T1 il programma resta invariato e non si generano ancora proposte operative. Il provider reale principale e NVIDIA Nemotron tramite l'accesso gratuito per prototipazione del Developer Program; OpenAI resta opzionale. Gli adattatori sono testati con trasporto simulato e con un collaudo live NVIDIA di due turni. `npm run test:agent:live` permette di ripetere la prova con la propria chiave e un server locale gia avviato.

Completato quando uno scenario testuale produce una risposta utile e una bozza di check-in corretta, senza poter applicare modifiche al programma.

### N1 — Persistenza e scenari simulati — Nello

Dipendenza: C0.

- [ ] Definire i modelli Prisma e il percorso di inizializzazione del database.
- [ ] Implementare `AgentRepository` e le verifiche di accesso ai record.
- [ ] Creare `prisma/seed.ts` con astronauta, identita demo e programma coerente.
- [ ] Implementare `SensorProvider` e `ScheduleProvider` simulati.
- [ ] Preparare tre scenari deterministici: riposo regolare, riposo insufficiente, dati discordanti.
- [ ] Documentare setup, reset dei dati dimostrativi e avvio.

Completato quando i dati sopravvivono al riavvio e ogni scenario puo essere ripetuto con gli stessi input.

### T2 — Report, diario e comportamento di compagnia — Tu

Dipendenze: T1; N1 per il salvataggio reale. Si puo iniziare con repository simulato.

- [ ] Generare report e bozza del diario dal check-in confermato e dal contesto autorizzato.
- [ ] Distinguere nel report misure, dichiarazioni, discrepanze e interpretazioni.
- [ ] Implementare un comportamento di compagnia che riconosca la propria natura artificiale e mantenga continuita con le conversazioni autorizzate.
- [ ] Non inserire nel report contenuti privati estranei al check-in condivisibile.
- [ ] Esporre recupero e modifica del diario e recupero dei report, con i relativi controlli di accesso.
- [ ] Gestire la rigenerazione senza duplicare report o voci dello stesso check-in.

Completato quando l'astronauta puo correggere il diario e Terra riceve soltanto il report previsto.

### N2 — Check-in, validatore e ciclo di approvazione — Nello

Dipendenze: C0 e N1. Usa inizialmente proposte simulate, senza attendere T1.

- [ ] Implementare correzione e conferma del check-in, impedendo effetti duplicati su conferme ripetute.
- [ ] Implementare il servizio che riceve la proposta strutturata generata dall'agent.
- [ ] Validare attivita esistenti, blocchi, dipendenze, durate, sovrapposizioni e limiti della giornata.
- [ ] Salvare una proposta immutabile con evidenze e versione del programma.
- [ ] Implementare elenco delle proposte e decisione approvata/rifiutata.
- [ ] Verificare il ruolo Terra sul server e registrare operatore, orario e commento.
- [ ] Applicare con controllo atomico della versione e protezione dai duplicati nell'adattatore simulato.
- [ ] Gestire proposta obsoleta, fallimento di applicazione e recupero dell'esito dopo timeout.
- [ ] Restituire stato e programma effettivi, distinguendo approvazione e applicazione.

Completato quando una proposta valida viene applicata una sola volta e una proposta obsoleta o non autorizzata non modifica il programma.

### T3 — Interfaccia vocale — Tu

Dipendenza: T1 stabile; puo procedere in parallelo a N2.

- [ ] Implementare `VoiceProvider` e le route server di trascrizione e sintesi.
- [ ] Gestire permesso del microfono, registrazione, invio e riproduzione.
- [ ] Mostrare la trascrizione e consentirne la correzione prima dell'invio.
- [ ] Mantenere sempre disponibile l'inserimento testuale.
- [ ] Gestire permesso negato, audio vuoto, formato non supportato, timeout e doppio invio.
- [ ] Impostare limiti audio ed evitare salvataggio o logging dell'audio grezzo.

Completato quando il percorso vocale usa gli stessi servizi e produce gli stessi oggetti del percorso testuale.

### T4 — Pagina di prova indipendente — Tu

Dipendenze: T1 e contratti API; collegamento progressivo con N1 e N2.

- [ ] Creare `/agent-demo` con scelta dello scenario, chat e controlli vocali.
- [ ] Mostrare dati estratti e correzione/conferma del check-in.
- [ ] Mostrare proposta, report e diario secondo i permessi.
- [ ] Aggiungere una vista tecnica Terra per approvazione e rifiuto, chiaramente marcata come demo.
- [ ] Mostrare il programma originale, quello proposto e quello effettivamente applicato.
- [ ] Gestire caricamento, errore, nessuna proposta e aggiornamento dello stato.
- [ ] Isolare la demo dall'autenticazione di produzione e dalla futura dashboard.

Completato quando il percorso completo e dimostrabile senza il codice di Fabrizio.

### N3 — Documentazione di integrazione — Nello

Dipendenze: C0; aggiornamento finale dopo N2 e T3.

- [ ] Scrivere `docs/agent/integration.md` con endpoint, payload, risposte ed errori.
- [ ] Includere esempi di chiamate per sessione, check-in, proposta, decisione e recupero stato.
- [ ] Documentare configurazione, variabili d'ambiente e modalita simulata/reale senza segreti.
- [ ] Spiegare come sostituire i provider di identita, sensori e programma.
- [ ] Esplicitare responsabilita transazionali, idempotenza e riconciliazione dell'applicazione.
- [ ] Concordare con Fabrizio il collegamento alla dashboard usando gli stessi endpoint della demo.

Completato quando Fabrizio puo collegare una propria vista senza importare i componenti grafici della demo o modificare il nucleo dell'agent.

### C1 — Verifica finale — Tu + Nello

- [ ] Eseguire i tre scenari e verificarne risultati e persistenza.
- [ ] Verificare rifiuto, doppia approvazione, programma modificato nel frattempo e applicazione fallita.
- [ ] Verificare che un astronauta non possa approvare e Terra non possa leggere il diario privato.
- [ ] Verificare che l'agent non abbia accesso diretto alla scrittura del programma.
- [ ] Verificare dati mancanti, output AI invalido e indisponibilita del provider.
- [ ] Verificare che report e diario non contengano informazioni inventate o trasferimenti di contenuti privati.
- [ ] Eseguire lint, controllo TypeScript, test pertinenti e build.
- [ ] Provare l'avvio da un checkout pulito seguendo la documentazione.

## Ordine di lavoro consigliato

1. Chiudere C0 e unire i contratti condivisi.
2. Procedere in parallelo con T1 e N1, usando adattatori simulati.
3. Collegare conversazione e persistenza; sviluppare T2 e N2 in parallelo.
4. Completare il percorso testuale fino all'applicazione approvata.
5. Aggiungere T3 e completare T4; aggiornare N3 lungo lo sviluppo.
6. Eseguire C1 e consegnare a Fabrizio demo e documentazione.

Ogni task dovrebbe diventare una issue o una PR con il relativo identificativo nel titolo. Evitare modifiche concorrenti a schema Prisma e contratti; comunicare ogni variazione delle API prima di integrarla.

## Criteri di accettazione del MVP

- L'astronauta puo completare un check-in con voce oppure testo.
- I dati dichiarati e quelli dei sensori restano distinguibili e correggibili dove previsto.
- L'agent puo decidere di non proporre alcuna variazione.
- Una proposta mostra motivazione, evidenze e differenze rispetto al programma corrente.
- Il programma non cambia prima di una decisione autorizzata da Terra.
- Una proposta rifiutata, duplicata o obsoleta non produce modifiche improprie.
- L'interfaccia comunica l'aggiornamento soltanto dopo la conferma dell'applicazione.
- Report operativo e diario personale sono persistiti con accessi distinti.
- Il flusso funziona con provider simulati e dispone di un percorso AI/vocale reale configurabile.
- Fabrizio puo integrare la funzionalita usando il contratto HTTP e gli adattatori documentati.

## Decisioni ancora da fissare in C0

- Fornitore e modelli per conversazione, trascrizione e sintesi vocale.
- Metriche dei sensori e scale soggettive effettivamente usate nella demo.
- Attivita e vincoli dello scenario dimostrativo.
- Sistema di autenticazione condiviso con la dashboard.
- Chi possiede il backend autorevole del programma durante l'integrazione.
- Limiti di conservazione di trascrizioni, check-in e diario.

Queste decisioni non impediscono di iniziare contratti e simulatori; nessuna chiave o dipendenza dalla dashboard e necessaria per il primo percorso simulato.
