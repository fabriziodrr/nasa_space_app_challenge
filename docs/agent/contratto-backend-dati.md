# Contratto di integrazione agent e backend dati — versione proposta 1

Questo documento fissa le decisioni per l'integrazione con il backend Python di Emanuel e la dashboard. È un contratto per la prossima implementazione: gli endpoint e gli schemi attuali non sono ancora tutti conformi. Le API demo esistenti restano descritte in [DATA_BACKEND.md](../DATA_BACKEND.md).

## Identità e provenienza

- `astronautId` dell'agent e `subject_id` Python identificano la stessa persona mediante una mappatura esplicita configurata dal server e autorizzata. Il modello e il browser non decidono la mappatura. Nella sola demo si può configurare esplicitamente `astro-1 → sleep-demo-14d`, marcandola `demo_only_unverified`: i dati non diventano così una storia personale verificata.
- Identità, modalità sintetica e ambito autorizzato sono fissati dal server per ogni richiesta. Il backend Python attuale è per uso locale fidato e non garantisce autenticazione multiutente: prima dell'uso con dati personali o accesso da Terra servono autenticazione e autorizzazione effettive.
- Ogni dato conserva ID originale, fonte, `observed_at` UTC, qualità e indicazione `synthetic`. Dati mancanti, non validi, futuri o fuori finestra restano distinti: non sostituirli con zero o valori simulati. I dati sintetici restano etichettati come tali.

## Check-in e scale

| Campo agent | Contratto comune | Origine |
| --- | --- | --- |
| `SLEEP_HOURS` | Numero 0–24, ore dichiarate | `self_report` |
| `SLEEP_QUALITY` | Intero 1–10: 1 molto scarsa, 10 molto buona | `self_report` |
| `FATIGUE` | **Intero 1–10: 1 minima, 10 massima stanchezza riferita** | `self_report` |
| `PHYSICAL_NOTES` | Testo riferito dall'astronauta | `self_report` |

`fatigue_rating` Python e `FATIGUE` agent usano 1–10 senza trasformazioni. Anche la qualità del sonno e l'umore sono su 1–10. `alertness` è una misura distinta e non viene convertita in stanchezza. Una frase ambigua non diventa un numero inventato. Il feedback Python costituisce dichiarazione confermata solo se `basis=self_report`, `user_confirmed=true` e `quality=valid`; l'inferenza del modello non è una dichiarazione della persona.

Le osservazioni nuove dell'agent includono `scaleMax: 10`; quelle precedenti senza metadato sono lette con `scaleMax: null` e restano di scala non specificata. Le correzioni di valori richiedono `scaleMax: 10`. Il backend Python richiede `scale_max: 10` per nuove autovalutazioni di qualità del sonno e umore e `mood_scale_max: 10` per l'umore nel feedback; i record precedenti senza metadato sono restituiti con scala nulla. Gli utenti delle API devono aggiornare client e validazioni: questa modifica introduce campi e intervalli nuovi nei contratti esistenti. I dati storici non vengono convertiti. La regola demo per le nuove osservazioni usa stanchezza almeno 8/10 e non applica soglie alle scale ignote: è una scelta illustrativa, non un criterio clinico.

## Lettura del backend e adattamento

Il runtime demo usa `PythonSensorProvider` per leggere `GET /v1/subjects/{subject_id}/agent-context?synthetic=true` sul backend locale `127.0.0.1:8000`, senza leggere direttamente il database Python. La mappatura server predefinita è `astro-1 → sleep-demo-14d` e resta **non verificata**. `AGENT_DATA_SUBJECT_ID` consente di cambiare il soggetto sintetico demo; solo `astro-1` è abilitato. Il contesto espone `snapshot_id`, `as_of`, `truncated` e `sleep_context`; il backend non espone uno storico immutabile degli snapshot.

| Dato Python | Dato agent | Regola |
| --- | --- | --- |
| `sleep_context.latest_measurement.sleep_hours` | `SLEEP_DURATION`, unità `h` | Solo misura `quality=valid`, con ID, fonte, periodo, timestamp e flag sintetico preservati. |
| `sleep_context.latest_measurement.awakenings_count` | `SLEEP_INTERRUPTION_COUNT`, unità `count` | Solo se presente e valido; non inventare il numero di risvegli. |
| Frequenza cardiaca | `RESTING_HEART_RATE`, `bpm` | Il contesto Python attuale non la fornisce: assente, senza usare un valore demo come se provenisse dal backend. |
| `latest_confirmed_feedback.fatigue_rating` | Feedback storico 1–10 | Fonte distinta dalla dichiarazione del check-in corrente; non aggiungerlo automaticamente alle osservazioni condivise. |

Le letture conservano metadati `provenance`, compresi periodo, metodo, soggetto demo, ID snapshot e stato. Le misure disponibili sono `DEGRADED` perché l'identità non è verificata; il report le presenta separatamente e non possono motivare proposte né deduzioni che le attribuiscono all'astronauta. Il sensore non disponibile ha valore `null` e un motivo esplicito (`MISSING`, `STALE`, `INVALID`, `UNAVAILABLE`). La misura è utilizzabile solo se la fine del periodo ricade nelle 24 ore precedenti e `observed_at` non è futuro rispetto alla richiesta: `as_of` non prova che il dato sia recente. Se `truncated=true`, il limite è visibile nel report. Timeout, risposta errata o servizio non disponibile non attivano fallback silenziosi a letture fittizie.

Per le prove indipendenti dal backend impostare `AGENT_SENSOR_PROVIDER=mock` e riavviare Next; l'impostazione predefinita è `python`. Per il backend, avviare il servizio Python come in [DATA_BACKEND.md](../DATA_BACKEND.md) e caricare dati sintetici. Gli esempi storici possono risultare `STALE`: non vengono presentati come misure correnti. I metadati aggiuntivi sulle letture estendono il contratto esistente e richiedono che i client con validazione rigida siano aggiornati.

Alla conferma del check-in, l'agent acquisisce una volta il contesto autorizzato e congela valori e metadati, ID snapshot Python, momento di acquisizione, misura webcam condivisa e versione della schedule. Generazione e retry usano quel contesto congelato; l'ID dello snapshot Python identifica il risultato ma non ne garantisce il recupero storico. La misura webcam selezionata per la conversazione è condivisibile con Terra solo con il consenso distinto alla conferma; selezionata non significa automaticamente condivisa.

## Report e schedule

Il rapporto deterministico Python descrive le fonti disponibili. Il report operativo dell'agent per Terra usa soltanto il contesto congelato e autorizzato, conserva le evidenze e distingue dichiarazioni, sensori, visione e deduzioni. Visione sintetica o insufficiente non è evidenza operativa; la visione non determina da sola sonno, stanchezza o diagnosi. Il diario resta privato.

La schedule demo versionata resta l'autorità **della demo** finché non esiste un provider condiviso. Nessun endpoint schedule è presente nel backend Python attuale. Il futuro `ScheduleProvider` concordato deve fornire lettura per astronauta e data/ID, versione, applicazione dopo decisione di Terra, controllo atomico della versione, deduplicazione durevole per proposta/decisione e riconciliazione degli esiti incerti. Solo `APPLIED` significa programma aggiornato; un rifiuto o una proposta obsoleta non modifica il programma. La selezione della vista nella dashboard non sostituisce l'autorizzazione di Terra.

## Sequenza di implementazione e verifica

1. Aggiornare i client alle scale 1–10 e ai metadati di scala; preservare le letture storiche non identificabili senza convertirle.
2. Definire schema eseguibile dell'adattatore Python/TypeScript e configurazione server della mappatura demo, mantenendo esplicita l'identità non verificata.
3. Implementare il provider di lettura, congelare il contesto e testare dati mancanti, invalidi, vecchi, sintetici, fuori ambito e backend non raggiungibile.
4. Generare report e proposta usando le fonti congelate e autorizzate; verificare separazione fra privato e condiviso e comportamento senza dati sufficienti.
5. Integrare la dashboard con report, proposta e decisione di Terra; definire e collegare il provider della schedule condivisa prima di dichiarare completata la sincronizzazione.
6. Collaudare voce, webcam, backend, report, decisione e aggiornamento del programma. La demo attuale può essere testata separatamente senza assumere che i dati sintetici rappresentino la stessa persona reale.
