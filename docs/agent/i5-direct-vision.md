# I5 — Invio diretto della misura palpebrale

La demo dell'agent incorpora il prototipo palpebrale in un iframe. Una volta arrestata la misura, l'astronauta sceglie **Invia misura all'agent**. Il prototipo prepara il medesimo export v2 già usato dal download e lo invia alla pagina ospite; l'host usa le API I1 e mostra il riepilogo ricevuto. La misura entra nella conversazione solo dopo la selezione esplicita nella pagina agent. La condivisione con Terra è una scelta distinta, alla conferma del check-in.

## Avvio locale

1. Dalla root agent avviare `npm run dev` e aprire `http://localhost:3000/voice-demo`.
2. Dalla cartella `feature-visione-palpebrale/vision-prototype` avviare `npm run dev`. Il prototipo usa `http://127.0.0.1:5173`.
3. Avviare una sessione nella demo, aprire **Visione palpebrale**, consentire la fotocamera, calibrare, avviare e arrestare la misura. Premere **Invia misura all'agent**, quindi selezionarla nella pagina principale.

L'invio diretto riguarda la misura webcam; il replay sintetico è ancora importabile con il file JSON di I4. L'accesso alla fotocamera richiede un contesto sicuro e il permesso dell'utente. La chiusura del riquadro o la conferma del check-in rimuovono l'iframe, rilasciando le risorse del prototipo. La pagina palpebrale continua a interrompere la cattura quando viene nascosta o cambia dispositivo.

## Origini e integrazione nell'host

Le impostazioni predefinite sono `NEXT_PUBLIC_VISION_ORIGIN=http://127.0.0.1:5173` nell'agent e `VITE_AGENT_ORIGIN=http://localhost:3000` nel prototipo. Devono corrispondere alle origini effettivamente usate nel browser: `localhost` e `127.0.0.1` sono origini distinte. Specificare solo schema, host e porta, senza percorso, credenziali o parametri. HTTP è accettato soltanto per loopback; per origini remote usare HTTPS. Riavviare i server dopo una modifica delle variabili; per la produzione ricostruire le applicazioni. Sono variabili pubbliche e non devono contenere segreti.

L'host valida esattamente origine e finestra dell'iframe e non invia al prototipo né il token né l'ID della sessione. Il prototipo accetta soltanto la risposta del genitore configurato e verifica origine, finestra e identificativo della richiesta; la configurazione viene confrontata con il referrer dell'iframe. Un host diverso non riceve automaticamente i dati. Il protocollo `crewready-vision-agent-v1` trasporta il JSON della misura, senza immagini o video; l'host lo associa alla propria sessione autenticata e usa l'endpoint I1. Non serve abilitare CORS tra Vite e Next perché è la pagina agent a chiamare la propria API.

L'invio richiede un'azione dell'utente e mantiene un identificativo stabile e la stessa istantanea nei retry. Se non riceve una conferma entro 15 secondi, il prototipo consente di riprovare oppure annullare l'invio in sospeso. L'annullamento elimina il tentativo locale, ma non può annullare una richiesta già arrivata al server: la misura potrebbe comunque comparire nell'host. Il server deduplica con l'identificativo della richiesta. Nessun invio parte automaticamente quando termina la misura. L'host può implementare lo stesso protocollo e gestire autenticazione e stato nel proprio codice; deve permettere l'uso della fotocamera nell'iframe e configurare eventuali policy CSP per le proprie origini.

## Verifiche e stato del codice

I test del bridge coprono verifica delle origini e delle finestre, rifiuto di messaggi estranei, limite dimensionale, timeout e riutilizzo dello stesso ID e contenuto. La prova pratica di webcam, microfono, cambio dispositivo, sospensione e recupero rete rimane in I6; non è una validazione dell'accuratezza della misura.

Il prototipo è incluso direttamente nella repo principale in `feature-visione-palpebrale/`, insieme al modello e agli asset WASM: il normale clone/pull è sufficiente, senza accesso a una seconda repository. I sorgenti provengono dalla revisione `9803a5f41eff521db5d1305af82323da11332eb5`, comprensiva delle modifiche I5 e di quelle locali preesistenti. Il parser copiato nel backend coincide con i corrispondenti 20 sorgenti TypeScript. Installazione delle dipendenze e avvio sono descritti nel [README principale](../../README.md#visione-palpebrale-inclusa).
