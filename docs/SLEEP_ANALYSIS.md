# Analisi del sonno e prova demo

## Funzione disponibile

`GET /v1/subjects/{subject_id}/sleep-analysis` produce un risultato deterministico, utilizzabile dalla dashboard o dal compagno. Nessun componente speech o modello AI viene eseguito.

Parametri obbligatori: `start` e `end`, timestamp con fuso. La finestra è `[start, end)`, al massimo 366 giorni. `synthetic` è `false` per impostazione predefinita; per la prova va impostato a `true`.

Il risultato contiene:

- `analysis_id`: hash del risultato e delle osservazioni selezionate, utile a identificare il rapporto condiviso.
- Stato di disponibilità e indicazione `partial_data` se il recupero supera il limite di 1.000 osservazioni del servizio.
- Gruppi distinti per dispositivo e metodo, senza mescolare le misurazioni.
- Serie con durata e identificativi di episodio e feedback associato.
- Media, mediana, estremi e deviazione standard della durata.
- Copertura dei giorni UTC, giorni mancanti e numero di episodi esclusi.
- Pendenza della durata nel tempo, direzione e differenza fra ultimo e primo episodio.
- Coppie sonno/fatica riferita ed eventuale correlazione descrittiva di Pearson.

Per ogni gruppo viene selezionato un episodio per giorno UTC di fine sonno: prevale quello che termina più tardi; le finestre sovrapposte non contano due volte. Non è un totale giornaliero inclusivo dei sonnellini. La copertura descrive la presenza di episodi, non l'effettiva aderenza del sensore.

Le misure sono filtrate per fine dell'episodio, non per momento di importazione. Il feedback associato è l'ultimo valore di fatica valido, riferito e confermato, entro 24 ore dalla fine del sonno e prima dell'inizio dell'episodio selezionato successivo. Una coppia per episodio evita di dare più peso ai giorni con più conversazioni.

La tendenza richiede almeno tre episodi. La correlazione richiede almeno tre coppie e variabilità in entrambe le variabili; altrimenti restituisce `null`. Non vengono calcolate significatività, causalità o diagnosi. La deviazione della durata non misura la regolarità degli orari; la qualità del sonno non viene inventata dalla durata.

## Prova pronta

File: [sleep_demo_14d.json](../server/examples/sleep_demo_14d.json). Sono **27 osservazioni interamente sintetiche**, con identificativo soggetto `sleep-demo-14d`, dal 1 al 14 novembre 2026. Non sono dati NASA o misure reali di un astronauta.

Lo scenario è costruito per mostrare durata progressivamente più breve e fatica riferita crescente. La relazione è deliberatamente disegnata: il suo valore di correlazione non è un risultato scientifico.

Da PowerShell nella cartella `server/`:

```powershell
.\.venv\Scripts\python.exe -m aegis_data import examples/sleep_demo_14d.json
```

Un secondo import degli stessi identificativi restituisce un errore di duplicazione senza modificare il database. Non serve importare nuovamente dopo il primo caricamento.

In alternativa, con il server avviato, si può caricare il file via API:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/v1/observations/import' -Method Post -ContentType 'application/json' -InFile '.\examples\sleep_demo_14d.json'
```

L'importazione HTTP è atomica: duplicati o input invalidi impediscono l'inserimento del lotto. Restano le limitazioni di accesso locale documentate in [DATA_BACKEND.md](DATA_BACKEND.md).

## Vedere il risultato

Dopo aver riavviato il server, aprire `/docs` e selezionare l'endpoint `sleep-analysis`:

| Campo | Valore demo |
|---|---|
| `subject_id` | `sleep-demo-14d` |
| `start` | `2026-11-01T00:00:00Z` |
| `end` | `2026-11-15T00:00:00Z` |
| `synthetic` | `true` |

Oppure aprire direttamente:

[Analisi della prova locale](http://127.0.0.1:8000/v1/subjects/sleep-demo-14d/sleep-analysis?start=2026-11-01T00%3A00%3A00Z&end=2026-11-15T00%3A00%3A00Z&synthetic=true)

Risultati attesi:

- 13 episodi strumentali ricevuti, uno invalido; 12 episodi analizzati.
- 14 giorni attesi, senza misura utilizzabile il 7 e l'11 novembre.
- Durata media circa 6,74 ore; andamento decrescente.
- 12 coppie di sonno/fatica; il feedback inferito non viene usato.
- Con `synthetic=false` lo stesso soggetto non presenta dati reali.

Il generatore [generate_sleep_demo.py](../server/examples/generate_sleep_demo.py) riproduce il file, senza modificare il database.

## Collegamento dell'agente

Il compagno può chiamare l'endpoint oppure `AgentDataTools.analyze_sleep(start, end)`. Identità del soggetto e modalità sintetica sono fissate dall'applicazione fidata durante la costruzione dell'adattatore.

La risposta può essere spiegata dal modello, che deve mantenere etichetta sintetica, copertura, periodo e limiti. La dashboard consuma lo stesso risultato numerico. L'analisi non è inserita automaticamente in ogni turno: l'agente la richiede quando è utile e con un intervallo esplicito.
