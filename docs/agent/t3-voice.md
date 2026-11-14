# T3: interfaccia vocale

La voce usa gli stessi servizi e messaggi della conversazione testuale. La demo indipendente è disponibile su `/voice-demo`: avviare il progetto secondo [la guida T1](t1-conversation.md), aprire la pagina, inserire il valore locale `AGENT_DEMO_TOKEN` e creare una sessione. Il token è distinto dalla chiave NVIDIA e resta nello stato della pagina. Premere il microfono, consentire l'accesso, dettare in italiano e interrompere la registrazione. La trascrizione è modificabile e viene inviata solo premendo «Invia». È sempre possibile scrivere; la lettura delle risposte è attivata dall'utente.

La demo usa il riconoscimento e la sintesi del browser, che devono essere supportati e abilitati dal browser utilizzato. Il riconoscimento può inviare l'audio a un servizio scelto dal browser: non è garantito il funzionamento offline. Non richiede una nuova chiave API dell'applicazione. Microfono e sintesi richiedono un contesto sicuro, come `localhost` o HTTPS.

## API vocali opzionali

Per integrazioni indipendenti dall'interfaccia, sono disponibili due route autenticate con gli stessi criteri delle route di conversazione. Sono disattivate per impostazione predefinita. Per abilitarle, installare e avviare separatamente servizi NVIDIA Speech NIM locali con modelli ASR e TTS che supportino `it-IT`; consultare la documentazione NVIDIA per requisiti hardware, disponibilità e termini. Configurare nel file `.env`:

```dotenv
AGENT_VOICE_PROVIDER=nvidia_nim
AGENT_NIM_ASR_URL=http://127.0.0.1:9000
AGENT_NIM_TTS_URL=http://127.0.0.1:9001
```

Sono accettati solo origin loopback. Le porte sono esempi e devono corrispondere ai servizi avviati. Riavviare l'app dopo le modifiche. La chiave del modello conversazionale NVIDIA non avvia né configura questi servizi. La demo browser non dipende da queste route.

- `POST /api/agent/v1/voice/transcriptions`: `multipart/form-data` con `sessionId`, `durationSeconds` e `audio` (file `audio/wav`, PCM 16 bit, mono o stereo). Limite 10 MB e 120 secondi; la durata è verificata dal contenuto. Restituisce `data.text` e `data.language`. Il risultato non viene inviato automaticamente come messaggio: l'interfaccia deve mostrarlo per la correzione e poi utilizzare la normale API dei messaggi con `inputMode: "VOICE"`.
- `POST /api/agent/v1/voice/speech`: JSON `{ "sessionId": "...", "messageId": "..." }`; restituisce `audio/mpeg` per una risposta dell'assistente appartenente alla sessione dell'astronauta autenticato. Il provider supporta testi fino a 2000 caratteri. Non accetta testo arbitrario.

I dati audio vengono elaborati in memoria, senza file temporanei o logging nel modulo agent. Le route restituiscono gli errori comuni del contratto; se i servizi non sono configurati o raggiungibili, restituiscono `PROVIDER_UNAVAILABLE`. Gli adattatori NIM sono stati verificati con servizi simulati: per una prova completa occorrono servizi locali funzionanti. Il contratto `VoiceProvider` permette di sostituire l'adattatore senza cambiare la dashboard.

Riferimenti: [API ASR NVIDIA](https://docs.nvidia.com/nim/speech/26.10.0/reference/api-references/asr/http-asr.html), [API TTS NVIDIA](https://docs.nvidia.com/nim/speech/26.10.0/reference/api-references/tts/http-tts.html).
