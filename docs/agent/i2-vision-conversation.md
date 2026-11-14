# I2 — Visione nel contesto della conversazione

Il servizio di conversazione usa `VisionObservationReader.getSelectedForSession(astronautId, sessionId)` per ottenere al massimo la misura esplicitamente selezionata. Valida il contratto I0 e controlla astronauta e sessione prima di fornire all'AI un riepilogo limitato, senza digest o metadati superflui. Un risultato non valido o appartenente a un'altra sessione interrompe il turno; nessun lettore o nessuna selezione produce un contesto vuoto. L'AI non può usare la visione come fonte per creare un'osservazione auto-riferita.

Il runtime collega `VisionService`, che restituisce soltanto l'osservazione selezionata nella sessione autorizzata; in assenza di selezione il risultato è vuoto. I test possono iniettare `MockVisionReader`, che produce dati dichiaratamente sintetici e insufficienti, o lettori specifici. L'importazione e selezione sono documentate nella [guida I1](i1-vision-import.md). La demo non costituisce una prova webcam reale.

I valori `AGENT_VISION_MIN_VALID_MS` (30000), `AGENT_VISION_MIN_COVERAGE` (0.7) e `AGENT_VISION_MAX_AGE_MINUTES` (120) regolano il controllo nel contesto di conversazione. Le limitazioni vengono ricalcolate a ogni turno e aggiunte a quelle del lettore, senza promuovere misure insufficienti; il congelamento alla conferma appartiene a I1. I valori sono sperimentali, non soglie cliniche.

Nemotron e OpenAI ricevono il contesto con le medesime istruzioni italiane; il provider simulato etichetta i dati sintetici e chiede chiarimenti sulle chiusure prolungate solo per misure utilizzabili. Testo e voce utilizzano il medesimo servizio. L'invio del riepilogo al modello remoto avviene solo nel percorso AI configurato, ed è distinto dalla condivisione operativa con Terra.
