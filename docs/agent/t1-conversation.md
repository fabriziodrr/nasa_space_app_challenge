# T1 — Conversazione testuale dell'assistente di bordo

## Stato e perimetro

Implementati: apertura e lettura della sessione, conversazione testuale, domande di approfondimento, bozza privata del check-in, adattatore AI simulato, adattatore NVIDIA Nemotron, adattatore OpenAI opzionale, autenticazione dimostrativa e API HTTP.

La composizione locale usa un repository in memoria e sensori/programma dimostrativi per rendere T1 provabile prima di N1. Non sostituisce la persistenza Prisma prevista per Nello: i dati si perdono al riavvio e non sono condivisi tra processi o istanze server.

Report, diario, conferma del check-in, proposte, decisioni di Terra e voce restano ai task T2/N2/T3. La conversazione T1 non pubblica report e non applica modifiche al programma.

## Avvio locale senza chiavi AI

Installare le dipendenze con `npm ci`. Creare `.env` a partire da `.env.example` e impostare:

```dotenv
AGENT_DEMO_ENABLED=true
AGENT_DEMO_TOKEN=<token-privato-di-almeno-16-caratteri>
AGENT_AI_PROVIDER=mock
AGENT_DEMO_SCENARIO=CONFLICTING_DATA
```

Sostituire il segnaposto con un token locale. Non usare prefissi `NEXT_PUBLIC_` e non pubblicare il token o le chiavi. Lo stesso token puo essere usato nei client locali di prova; nella dashboard finale si usera l'autenticazione condivisa, non una credenziale di servizio inclusa nel bundle frontend.

Eseguire `npm run dev`. Non serve inizializzare il database per questa modalita. Su PowerShell usare `npm.cmd` se `npm.ps1` e bloccato dalla policy.

La demo e disabilitata per impostazione predefinita. `instrumentation.ts` valida la configurazione all'avvio e rifiuta `AGENT_DEMO_ENABLED=true` in produzione. Finche non sono collegati gli adattatori reali di identita e persistenza, le API in produzione restituiscono 503: non attivano una memoria temporanea o un'identita anonima.

Il runtime demo e condiviso tra le route nello stesso processo e mantenuto durante gli aggiornamenti a caldo di Next. Riavviare il server quando si cambiano configurazione o implementazioni del runtime/core; il riavvio azzera le sessioni.

## Provare le API da PowerShell

In un secondo terminale, usare lo stesso token configurato nel server:

```powershell
$base = 'http://localhost:3000/api/agent/v1'
$headers = @{ Authorization = 'Bearer <lo-stesso-token-locale>' }

$session = Invoke-RestMethod -Method Post -Uri "$base/sessions" `
  -Headers $headers -ContentType 'application/json' `
  -Body (@{ astronautId = 'astro-1' } | ConvertTo-Json)

$sessionId = $session.data.id
$body = @{
  clientMessageId = 'local-message-1'
  text = 'Ho dormito 4 ore. Qualita del sonno 2 su 5. Stanchezza 4 su 5.'
  inputMode = 'TEXT'
} | ConvertTo-Json

$turn = Invoke-RestMethod -Method Post -Uri "$base/sessions/$sessionId/messages" `
  -Headers $headers -ContentType 'application/json' -Body $body
$turn.data.assistantMessage.text
$turn.data.checkIn

Invoke-RestMethod -Method Get -Uri "$base/sessions/$sessionId" -Headers $headers
```

Ripetere lo stesso body con lo stesso `clientMessageId` restituisce lo stesso turno salvato, senza una nuova chiamata AI. Riutilizzare l'ID con un testo o un `inputMode` diverso restituisce 409 `IDEMPOTENCY_CONFLICT`. Un nuovo messaggio usa un nuovo ID. Ogni sessione appartiene a `astro-1`, l'unico astronauta dell'identita demo.

La modalita mock ha un parser limitato e risposte marcate `[Simulazione]`. Forme supportate:

- `Ho dormito 5 ore.` oppure `Ho dormito cinque ore e mezza.`
- `Qualita del sonno 2 su 5.`
- `Stanchezza 4 su 5.`
- `Fisicamente: mi sento affaticato.`

Un generico «ho dormito male» non diventa un numero. Formulazioni ambigue o non riconosciute provocano una richiesta di chiarimento. Il mock e pensato per test riproducibili, non per interpretare ogni formulazione italiana.

Con `CONFLICTING_DATA`, il sensore simula 8 ore mentre l'esempio ne dichiara 4: l'assistente espone la discrepanza e chiede chiarimenti. Non cambia il valore riferito per farlo coincidere con il sensore. Il confronto dimostrativo del mock non costituisce una soglia clinica.

## Attivare Nemotron con l'accesso gratuito per prototipazione

Il percorso consigliato per il prototipo e NVIDIA NIM: NVIDIA documenta l'accesso gratuito agli endpoint API per i membri del Developer Program per prototipazione, ricerca e sviluppo. Servono un account NVIDIA e una chiave API; non serve una chiave OpenAI. L'accesso e soggetto alle condizioni e ai limiti NVIDIA e non equivale a un servizio di produzione gratuito e illimitato. Verificare disponibilita e limiti del proprio account nel [catalogo NVIDIA](https://build.nvidia.com/explore/discover). Fonte: [FAQ ufficiali NIM](https://docs.api.nvidia.com/nim/docs/product).

1. Accedere al catalogo NVIDIA e aderire al Developer Program se richiesto.
2. Cercare `nvidia/nemotron-3.5-super-vl-120b-a12b` e generare una chiave API nel proprio account.
3. Inserire la chiave soltanto nel file locale `.env`, mantenendo il bootstrap demo di T1:

```dotenv
AGENT_DEMO_ENABLED=true
AGENT_DEMO_TOKEN=<token-locale-privato-di-almeno-16-caratteri>
AGENT_AI_PROVIDER=nvidia
NVIDIA_API_KEY=<chiave-api-nvidia>
NVIDIA_MODEL=nvidia/nemotron-3.5-super-vl-120b-a12b
```

Il token demo e una credenziale locale scelta da voi per accedere alle nostre API; `NVIDIA_API_KEY` e la chiave rilasciata da NVIDIA, usata soltanto dal server verso il modello. Riavviare `npm run dev` dopo aver cambiato la configurazione. Le chiamate di prova nella sezione PowerShell restano identiche.

L'adattatore chiama `https://integrate.api.nvidia.com/v1/chat/completions` senza streaming e con ragionamento intermedio disabilitato. Il modello predefinito e Nemotron 3.5 Super VL; `NVIDIA_MODEL` permette di selezionare un altro Nemotron accessibile all'account e compatibile con gli stessi parametri. Il [riferimento API](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3_5-super-vl-120b-a12b-infer) descrive endpoint e parametro `reasoning_effort: none` usato per disabilitare il ragionamento intermedio.

Lo schema JSON viene incluso nelle istruzioni e verificato localmente. L'adattatore non richiede `response_format`, mantenendo il controllo locale anche per modelli configurati senza generazione vincolata. Il codice non presume che il fornitore garantisca lo schema. Accetta JSON oppure un unico blocco Markdown che contenga l'intero JSON; rifiuta testo circostante, risposte troncate, rifiuti, chiamate a strumenti e oggetti non validi. Il controllo di provenienza dell'orchestratore resta obbligatorio prima del salvataggio.

Un limite NVIDIA restituisce 429 `RATE_LIMITED`; chiave errata o modello non accessibile producono un errore esplicito del provider. Una risposta HTTP 202 in attesa produce 503 ritentabile, senza salvare un mezzo turno. Non sono previsti retry automatici o fallback verso OpenAI o il mock. In questo modo il superamento dei limiti non attiva un altro servizio.

`AGENT_AI_PROVIDER=mock` rimane il valore predefinito per poter avviare i test senza account o rete; con `nvidia` l'agent usa il modello reale. Non sono necessarie dipendenze SDK aggiuntive.

Il trasporto NVIDIA e l'integrazione con i controlli del core sono testati con HTTP simulato e con un collaudo live di due turni attraverso Next.js. Il precedente Nano restituiva HTTP 410: il modello predefinito e stato aggiornato al Super VL disponibile. Il collaudo verifica un percorso dimostrativo con dati fittizi, non una validazione clinica o esaustiva della qualita delle risposte.

## Alternativa opzionale OpenAI

L'adattatore OpenAI resta disponibile per compatibilita, con fatturazione/crediti separati secondo il proprio account. Non e necessario per usare Nemotron e non viene mai selezionato automaticamente. Per attivarlo esplicitamente, configurare sul server:

```dotenv
AGENT_AI_PROVIDER=openai
OPENAI_API_KEY=<chiave-server>
OPENAI_MODEL=<modello-abilitato-per-Responses-e-Structured-Outputs>
```

Il modello e obbligatorio e non e fissato nel codice. Il provider usa la Responses API con un JSON Schema derivato dai contratti, output strutturato strict, `store: false` e nessuno strumento. Non usa fallback silenziosi verso il mock. Disabilitare il salvataggio della risposta API non sostituisce la verifica della politica di trattamento dati del fornitore prima di impiegare dati reali.

Riferimenti: [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

La generazione JSON vincola il formato; non dimostra da sola che ogni informazione estratta sia corretta. L'orchestratore controlla provenienza e coerenza strutturale; la successiva conferma umana del check-in resta necessaria.

Il trasporto dell'adattatore OpenAI e testato con risposte HTTP simulate. Non sono necessarie chiavi per i test e non vengono eseguite chiamate a pagamento durante la suite. La verifica con il modello effettivamente scelto richiede una chiave e va svolta prima della demo reale.

## Configurazione e limiti

| Variabile | Valore predefinito / significato |
| --- | --- |
| `AGENT_DEMO_ENABLED` | `false`; bootstrap locale esplicito, vietato in produzione |
| `AGENT_DEMO_TOKEN` | Obbligatorio per la demo, 16–512 caratteri |
| `AGENT_DEMO_SCENARIO` | `RESTED`; anche `POOR_SLEEP`, `CONFLICTING_DATA` |
| `AGENT_AI_PROVIDER` | `mock`; `nvidia` per Nemotron reale, `openai` come alternativa opzionale |
| `NVIDIA_API_KEY` | Obbligatoria soltanto per `nvidia`; non inviata al browser |
| `NVIDIA_MODEL` | `nvidia/nemotron-3.5-super-vl-120b-a12b` se omessa |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Obbligatorie soltanto per `openai` |
| `AGENT_AI_TIMEOUT_MS` | 30000; da 100 a 120000 ms |
| `AGENT_CONTEXT_MESSAGE_LIMIT` | 20; da 1 a 100 messaggi correnti, incluso l'ultimo |
| `AGENT_PREVIOUS_CHECK_IN_LIMIT` | 3; da 0 a 10 check-in confermati dello stesso astronauta |

L'orchestratore legge sensori delle ultime 24 ore e passa al modello al massimo le ultime 48 letture. Il programma e richiesto per la data UTC corrente; il bootstrap usa `Etc/UTC`. Il collegamento a un giorno operativo con un altro fuso deve essere concordato con il provider del programma.

Il contesto serializzato e limitato a 64000 caratteri. Se necessario vengono rimossi prima i check-in storici meno recenti, poi i messaggi piu vecchi, poi le letture piu vecchie. L'ultimo messaggio, la bozza corrente e lo snapshot del programma non sono troncati; se da soli superano il limite, il servizio restituisce un errore esplicito.

La richiesta HTTP JSON e limitata a 64 KiB effettivi, anche senza `Content-Length`. I messaggi mantengono il limite di 8000 caratteri del contratto. La memoria demo ammette massimo 500 sessioni e 2000 messaggi per sessione; sono limiti di sviluppo, non una politica di conservazione.

## Comportamento dell'orchestratore

1. Autorizza l'identita verificata e lo scope dell'astronauta.
2. Recupera un eventuale turno gia salvato con lo stesso ID client.
3. Rifiuta sessioni chiuse o check-in confermati per nuovi messaggi.
4. Recupera in parallelo sensori, programma e memoria autorizzata.
5. Invia un contesto limitato al provider, separato dalle istruzioni fisse.
6. Applica deadline e cancellazione anche se un adattatore ignora il segnale di abort.
7. Valida schema, campi mancanti e riferimenti alle evidenze.
8. Assegna ID e timestamp sul server e salva insieme messaggi e nuova revisione della bozza.

L'output dell'AI e sempre non fidato. Una nuova osservazione o una correzione deve citare l'ultimo messaggio dell'astronauta; non puo citare risposte dell'assistente, sessioni altrui o ID inventati. Le osservazioni precedenti devono essere preservate nello snapshot; ID e provenienza invariati vengono mantenuti anche quando il messaggio originale e fuori dal contesto limitato.

Nessuna osservazione viene condivisa automaticamente: `sharedObservationIds` resta vuoto. T1 non dispone di accesso in scrittura al programma. I metodi di generazione report/diario del contratto completo `AiProvider` sono separati in capability (`ConversationAiProvider`, `OperationalAiProvider`, `DiaryAiProvider`); gli adattatori T1 implementano soltanto la prima, senza metodi fittizi per i task successivi.

In caso di output invalido, riferimenti errati, timeout o errore del modello non viene salvato un mezzo turno. Il client puo ritentare con lo stesso ID. Le richieste identiche in corso condividono una chiamata nel singolo processo; l'atomicita e la deduplicazione persistente di `commitTurn` restano obbligatorie per N1. Due messaggi differenti sulla stessa revisione non si sovrascrivono: uno riceve un conflitto e deve rileggere lo stato prima di ritentare. Il client dovrebbe inviare un turno alla volta.

## Integrazione con N1 e dashboard

File principali:

| File | Responsabilita |
| --- | --- |
| `server/agent/core/conversation-service.ts` | Logica della conversazione, senza dipendenze da Next o Prisma |
| `server/agent/ports.ts` | `ConversationRepository`, provider e capability |
| `server/agent/runtime.ts` | Punto di composizione da collegare agli adattatori N1 |
| `server/agent/http/conversation-handlers.ts` | Identita, JSON, envelope e codici HTTP |
| `server/agent/prompts/conversation.ts` | Istruzioni del provider reale |
| `server/agent/adapters/conversation-ai-factory.ts` | Selezione esplicita tra mock, NVIDIA e OpenAI |
| `server/agent/adapters/nvidia-conversation-ai.ts` | Chiamata Nemotron e validazione del risultato |
| `app/api/agent/v1/sessions/**/route.ts` | Route sottili Next.js |

Per Nello: implementare `AgentRepository`; il sottoinsieme `ConversationRepository` e gia compatibile con le firme C0. Le operazioni di `commitTurn` devono deduplicare, controllare la revisione e salvare entrambi i messaggi e la bozza in una sola transazione. Non inserire chiamate al modello dentro una transazione. Usare `AgentError` da `core/errors.ts` per i conflitti del dominio.

Nel punto di composizione sostituire repository in memoria, identita demo e provider di contesto con gli adattatori reali, poi creare il servizio:

```ts
const service = createConversationService({
  repository: prismaAgentRepository,
  ai: conversationAiProvider,
  sensors: sensorProvider,
  schedule: scheduleReader,
});
const handlers = createConversationHttpHandlers(() => ({
  identity: sharedIdentityProvider,
  service,
}));
```

I nomi nell'esempio indicano implementazioni da fornire; non sono moduli gia presenti. L'identita viene risolta a ogni richiesta e passata ai metodi del servizio, non fissata nella sua istanza. Il servizio riceve soltanto `ScheduleReader`, senza `applyApproved`.

Per Fabrizio: usare le tre route del contratto v1 gia implementate; la risposta ai messaggi include sia il testo da mostrare sia la bozza strutturata. Nessun componente React e obbligatorio. Gestire 401/403/404, 409, 429, 502/503/504 e consentire il retry con lo stesso ID. Le risposte private hanno `Cache-Control: no-store`. L'integrazione con cookie usa origine comune; richieste con cookie e un'origine differente vengono rifiutate. Non e configurato CORS permissivo.

## Verifica

### Prova automatica con il modello reale

Richiede Node.js 20.12 o successivo e `.env` configurato per NVIDIA. In un terminale avviare `npm run dev`; in un secondo terminale, dalla root della repo:

```text
npm run test:agent:live
```

Se il server usa un'altra porta, per esempio quella della prova locale eseguita durante lo sviluppo:

```text
npm run test:agent:live -- --base-url http://127.0.0.1:3101
```

Su PowerShell usare `npm.cmd` se necessario. Il comando legge i token da `.env` senza stamparli, usa due messaggi fittizi e mostra le risposte dell'agent. Verifica estrazione, continuita del check-in, retry senza duplicati, 401 senza autenticazione e 409 con ID riutilizzato per un testo diverso. Le due generazioni consumano la quota NVIDIA del proprio account; le verifiche successive non generano altre risposte AI. Non modifica il programma e non invia report a Terra.

L'URL del test e limitato a localhost. Per azzerare le sessioni del repository temporaneo riavviare il server. Per una conversazione manuale usare le chiamate PowerShell riportate sopra, cambiando `clientMessageId` a ogni nuovo turno.

### Controlli automatici senza chiamate al modello

```text
npm run test:agent
npm run typecheck
npm run lint
npm run build
```

I test coprono percorso testuale, dati mancanti e discordanti, correzioni, retry, concorrenza, isolamento degli astronauti, sessioni concluse, output AI invalido, timeout, trasporti NVIDIA/OpenAI simulati, selezione del provider ed errori HTTP. La prova attraverso Next.js verifica inoltre che il runtime condiviso funzioni tra route compilate separatamente.
