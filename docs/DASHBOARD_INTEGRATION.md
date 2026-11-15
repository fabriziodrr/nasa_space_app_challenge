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

Aprire `http://localhost:3000` e accedere alla dashboard. Le viste leggono automaticamente le osservazioni sintetiche già presenti nel servizio dati; in assenza di osservazioni mostrano lo stato vuoto. Selezionare soggetto e date corrispondenti; **Until** è escluso.

Il proxy Next.js usa `http://127.0.0.1:8000` o la variabile server `AEGIS_DATA_API_URL`. Consente solo la modalità sintetica: l'accesso a dati personali e il collegamento a Terra richiedono autenticazione e autorizzazione non ancora implementate. Gli endpoint Python rimangono destinati all'uso locale fidato.

Se Next.js usa una porta diversa dalla 3000, impostare `AGENT_NODE_API_URL` nell'ambiente del servizio Python all'origine HTTP locale di Next.js, per esempio `http://127.0.0.1:13000`. Per il servizio Python su una porta diversa dalla 8000, impostare `AEGIS_DATA_API_URL` nel processo Next.js.

La UI segnala backend non disponibile, dati mancanti e osservazioni duplicate. Il grafico presenta gli episodi disponibili, il numero di giorni coperti e i feedback confermati; non esprime giudizi clinici.

## Rapporto dell'agente dati

Nella demo `/voice-demo`, la misura vision completata viene inviata e selezionata automaticamente. Per includerla nel rapporto di Terra occorre selezionare la condivisione della misura e confermare il check-in. Alla conferma il report operativo usa uno snapshot del programma, dei sensori disponibili e delle sole informazioni condivise; le viste **Data agent** e **Crew Data / Vision report** leggono quel medesimo rapporto per l'astronauta e il check-in selezionati. Il diario resta privato.

I dati di esempio vengono letti dal servizio Python. Per i profili demo senza misura nel servizio, soltanto in caso di risposta esplicita `MISSING`, l'agente può leggere in memoria la fixture sintetica del profilo, con timestamp originale e qualità degradata. Non viene scritta nel database del sonno; dati vecchi, servizi offline e identità non corrispondenti rimangono segnalati. Le credenziali demo sono gestite dal server e non vanno inserite nell'interfaccia; per i profili dell'equipaggio non configurati esplicitamente il server Next genera credenziali temporanee distinte.

La scelta del profilo è una funzione della sola demo locale: non equivale a un sistema di autenticazione. La sessione demo è disponibile soltanto in ambiente non produttivo su localhost; le credenziali di provider AI restano configurazioni server separate.

Il workflow deterministico Python e il companion LangChain rimangono disponibili come componenti separati; il rapporto operativo condiviso è generato dal provider configurato dell'agente. Il database Python e quello Prisma restano fisicamente separati. I dati sintetici non costituiscono misure personali verificate né una diagnosi.
