# T3: interfaccia vocale

La voce usa gli stessi servizi e messaggi della conversazione testuale. La demo indipendente è disponibile su `/voice-demo`: avviare il progetto secondo [la guida T1](t1-conversation.md), aprire la pagina, inserire il valore locale `AGENT_DEMO_TOKEN` e creare una sessione. Il token è distinto dalla chiave NVIDIA e resta nello stato della pagina.

Due modalità di input vocale:

- **Conversazione continua**: «Avvia conversazione» avvia un ciclo a mani libere. La fine della frase viene rilevata da una pausa stabile nella trascrizione (nessuna parola nuova per circa 2.5 s, regolabile con `quietMs` del componente): a quel punto il messaggio viene inviato, la risposta letta ad alta voce e l'ascolto riprende. «Termina conversazione» interrompe il ciclo. Il rilevamento si basa sulla pausa, non su un'analisi del senso della frase; il microfono deve essere consentito e si consiglia un ambiente senza il suono della sintesi stessa in riproduzione (es. cuffie).
- **Modalità manuale**: premere il microfono, dettare in italiano e premere «Termina dettatura». La trascrizione è modificabile e viene inviata solo premendo «Invia». È sempre possibile scrivere.

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

### Sintesi ElevenLabs (opzionale)

Per una voce più naturale senza avviare servizi locali, è disponibile la sintesi **ElevenLabs** (solo TTS; la trascrizione resta del browser). Richiede un account ElevenLabs e una chiave API. Il piano gratuito impone l'**attribuzione pubblica** ("powered by ElevenLabs"), già presente nella pagina della demo. Configurare nel `.env`:

```dotenv
AGENT_VOICE_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=<chiave-api>
ELEVENLABS_VOICE_ID=<id-della-voce>
# ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

`ELEVENLABS_VOICE_ID` si trova nel catalogo voci di ElevenLabs (selezionare una voce italiana, il suo ID è visibile nella scheda/URL). Il modello predefinito `eleven_multilingual_v2` supporta l'italiano. Verificare prezzi e limiti sul sito ElevenLabs: possono cambiare. La demo prova prima la route `/voice/speech` e ripiega sulla sintesi del browser se la route non è disponibile.

Riferimenti: [API ASR NVIDIA](https://docs.nvidia.com/nim/speech/26.10.0/reference/api-references/asr/http-asr.html), [API TTS NVIDIA](https://docs.nvidia.com/nim/speech/26.10.0/reference/api-references/tts/http-tts.html), [ElevenLabs Text-to-Speech](https://elevenlabs.io/docs/api-reference/text-to-speech/convert).
