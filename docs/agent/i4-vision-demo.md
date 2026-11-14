# I4 — Prova della misura palpebrale con l'agent

La pagina indipendente è `/voice-demo`. Avviare il progetto dalla root con `npm run dev`, aprire `http://localhost:3000/voice-demo` e inserire il valore locale `AGENT_DEMO_TOKEN`. Il token è distinto dalla chiave NVIDIA e non viene memorizzato nel browser.

È disponibile anche l'invio diretto dal prototipo incorporato: vedere la [guida I5](i5-direct-vision.md). L'importazione manuale resta disponibile.

1. Avviare una sessione e inviare un messaggio testuale o vocale per creare una bozza di check-in. È possibile importare la misura anche prima del primo messaggio.
2. Nel prototipo palpebrale avviare una misura webcam oppure un replay, quindi esportare il JSON v2. Il prototipo si avvia dalla propria cartella `feature-visione-palpebrale/vision-prototype` con `npm run dev`.
3. Nella demo agent scegliere il file ed eseguire **Importa misura**. Il caricamento accetta file JSON non vuoti fino a 10 MiB. La validazione effettiva avviene sul server.
4. Controllare origine, durata valida, copertura, quota di chiusura, intervallo e limitazioni; premere **Seleziona misura**. Solo la misura selezionata è disponibile nella conversazione. È possibile rimuovere la selezione oppure proseguire senza misura.
5. Nella revisione del check-in selezionare esplicitamente le osservazioni personali e, se desiderato, la misura da condividere con Terra. Le caselle sono inizialmente deselezionate. Premere **Conferma check-in**: viene avviata la generazione del report. La conferma chiude la conversazione della sessione.

Il pulsante di importazione usa la stessa chiave per ripetere il caricamento dello stesso file. Se la risposta della selezione o della conferma non arriva, la demo blocca le altre operazioni e permette di ripetere la stessa richiesta prima di proseguire. Le operazioni in corso non possono sovrapporsi; il riconoscimento vocale viene interrotto durante importazione, selezione o conferma.

Per i casi riproducibili, usare un replay del prototipo per ottenere una misura `synthetic`, contrassegnata come insufficiente per il contesto operativo. Una misura webcam con tempo valido e copertura inferiori ai limiti configurati mostra i relativi motivi; una misura webcam sufficientemente lunga e coperta può essere classificata `USABLE` se recente e non interrotta. Non trasformare un replay sintetico in un risultato webcam per simulare il caso utilizzabile. Soglie e limitazioni sono descritte nella [guida I0](vision-i0.md).

I test automatici coprono il client HTTP e i controlli di importazione/conferma del backend. Il collaudo visivo, webcam e microfono reali e il report completo rimangono da verificare in I6. L'interfaccia e il flusso proposti non sostituiscono l'integrazione della dashboard di Fabrizio.
