# Dashboard: integrazione della demo sonno

La sezione **Sleep & reported fatigue** nella dashboard legge l'analisi dal backend Python. Le due viste ISS e Houston usano attualmente gli stessi dati sintetici locali: non rappresentano una sincronizzazione con Terra. La mappa corporea mantiene valori fittizi indipendenti.

## Avvio

In `server/`, avviare il backend:

```powershell
.\.venv\Scripts\python.exe -m uvicorn aegis_data.api:create_app --factory --host 127.0.0.1 --port 8000
```

In un altro terminale, dalla radice della repo:

```powershell
npm install
npm run dev
```

Aprire `http://localhost:3000` e accedere alla dashboard. Il pulsante **Load sample** importa i dati sintetici incorporati; se sono già presenti, li mostra senza reinserirli. **Import synthetic JSON** accetta un array nel formato delle osservazioni del backend, con `synthetic: true` per ogni elemento. Selezionare soggetto e date corrispondenti; **Until** è escluso. L'importazione ricarica il grafico.

Il proxy Next.js usa `http://127.0.0.1:8000` o la variabile server `AEGIS_DATA_API_URL`. Consente solo la modalità sintetica: l'accesso a dati personali e il collegamento a Terra richiedono autenticazione e autorizzazione non ancora implementate. Gli endpoint Python rimangono destinati all'uso locale fidato.

La UI segnala backend non disponibile, dati mancanti e osservazioni duplicate. Il grafico presenta gli episodi disponibili, il numero di giorni coperti e i feedback confermati; non esprime giudizi clinici.
