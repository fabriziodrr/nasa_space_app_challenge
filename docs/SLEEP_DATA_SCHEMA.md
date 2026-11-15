# Dati del sonno: contratto iniziale

AEGIS conserva dati riferiti e strumentali con origine distinta. I campi sono una proposta di interoperabilità per il prototipo; non implicano la presenza di un dispositivo o un protocollo NASA identico.

| Campo | Significato | Fonte |
|---|---|---|
| `period_start`, `period_end` | Intervallo osservato, con fuso orario | Strumento |
| `sleep_hours` | Ore di sonno stimate, da 0 a 24 | Strumento |
| `sleep_latency_minutes` | Minuti prima dell'addormentamento | Opzionale, stima dello strumento |
| `wake_after_sleep_onset_minutes` | Minuti svegli dopo l'addormentamento | Opzionale, stima dello strumento |
| `awakenings_count` | Numero di risvegli | Opzionale, stima dello strumento |
| `sleep_efficiency_percent` | Efficienza riportata dal dispositivo, 0–100% | Opzionale; definizione del produttore da verificare |
| `sleep_stages.rem_minutes` | Durata REM stimata in minuti | Opzionale, sensore EEG o simulazione EEG dichiarati |
| `heart_rate_variability.value_ms` | Variabilità cardiaca in millisecondi | Opzionale; dispositivo, metodo e aggregazione espliciti |
| `sleep_quality` | Valutazione 1–5 della persona | Check-in separato `sleep` |
| `fatigue_rating`, `alertness` | Stato riferito 1–10 | Feedback confermato separato |

Ogni rilevazione strumentale richiede dispositivo, metodo, timestamp, qualità dichiarata e flag sintetico. I campi facoltativi mancanti restano `null`: non sono dedotti dal tempo totale. Non si calcolano REM o HRV in assenza di dispositivi e protocolli appropriati.

La [ricerca NASA sulla actigrafia](https://ntrs.nasa.gov/citations/20220014774) considera durata, tempo sveglio dopo l'addormentamento ed efficienza; [NASA descrive anche questionari sulla qualità percepita](https://www.nasa.gov/humans-in-space/spaceflight-standard-measures-characterizing-how-humans-adapt-in-space/). Questi precedenti motivano i campi, ma non validano gli strumenti o gli algoritmi AEGIS. I dati storici sintetici già presenti rimangono compatibili con i nuovi campi opzionali.

NASA descrive l'esperimento ESA [Dreams](https://www.nasa.gov/humans-in-space/science-in-space-week-of-sept-15-2023-sleep-on-station/), con fascia EEG e informazioni sulle fasi del sonno; una [dimostrazione SpaceWear](https://www.nasa.gov/blogs/stationreport/2023/09/19/iss-daily-summary-report-9-19-2023/) ha raccolto anche variabilità cardiaca. Questi sono esempi di studi, non la prova che ogni navicella abbia sensori permanenti o che AEGIS vi sia collegato. Il metodo RMSSD e l'aggregazione nel campione sono scelte fittizie, non valori ufficiali NASA.

Il file [nasa_sensor_demo.json](../server/examples/nasa_sensor_demo.json) contiene una notte interamente sintetica: REM, HRV e gli altri valori sono inventati per mostrare il flusso. La dashboard li carica con **Carica sensori demo**, poi li mostra nel rapporto dopo **Carica rapporto**. Se il campione esiste già, non viene sovrascritto. L'agente dati inoltra le misure nel proprio rapporto; non attribuisce soglie cliniche né modifica una diagnosi o il punteggio di fatica.

## Contesto intermedio

`get_integrated_context` combina lo snapshot personale sintetico con la misura vision **selezionata**. La risposta mantiene origini e qualità separate, esplicita che l'identità comune è ancora da verificare e non calcola diagnosi di fatica. Se vision non risponde, lo stato è `unavailable` e il sonno resta leggibile.

Per test senza modello è disponibile `POST /v1/demo/integrated-context`, con lo stesso token e la stessa `vision_session_id` descritti in [LANGCHAIN.md](LANGCHAIN.md). Non registra né trasmette automaticamente la misura vision a Terra.

Nella pagina `/voice-demo`, dopo avere importato e selezionato una misura, il pulsante **Verifica contesto sonno e vision** richiama il contesto tramite il proxy locale. Il backend Python deve essere avviato sulla porta 8000, con `AGENT_DEMO_TOKEN` identico a quello del server Next. Il riepilogo mostra origine e disponibilità, non una conclusione medica.
