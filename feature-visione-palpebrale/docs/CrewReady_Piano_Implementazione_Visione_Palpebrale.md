# Visione palpebrale piano di implementazione per due sviluppatori

**Progetto:** prototipo autonomo di osservazione palpebrale per CrewReady  
**Partecipanti:** Tu e Nervo  
**Versione:** 1.0 del 13 novembre 2026  
**Riferimento:** [Specifica della funzione](CrewReady_Feature_Visione_Palpebrale.md)  
**Stato:** piano operativo; attività e verifiche ancora da eseguire.

Il lavoro viene diviso in due percorsi che avanzano in parallelo: **tu realizzi applicazione, acquisizione, interfaccia ed esportazione; Nervo realizza inferenza, calibrazione e motore di misura**. Un contratto condiviso permette di sviluppare l'interfaccia con dati sintetici mentre viene preparata la computer vision.

Il risultato è un'applicazione locale nella cartella `vision-prototype/`, con asset locali e analisi riutilizzabile. L'integrazione completa in CrewReady e l'esecuzione dell'inferenza su Arduino UNO Q sono successive alla prima consegna.

## 1 Risultato da consegnare

- Applicazione TypeScript con React e Vite, avviabile in locale.
- Webcam con avvio e arresto espliciti, anteprima e overlay opzionale.
- Calibrazione tecnica guidata e stati distinti per dati utilizzabili o insufficienti.
- Apertura dei due occhi, chiusure bilaterali, durate, copertura e quota temporale di chiusura.
- Grafico con intervalli non valutabili e riepilogo della sessione.
- Modalità sintetica riproducibile, disponibile anche senza webcam.
- Esportazione JSON versionata con configurazione e calibrazione necessarie alla riproduzione.
- Esempio di consumatore separato, test del motore e documentazione del collaudo.

Le misure descrivono il comportamento palpebrale osservato. La UI non deve trasformarle in percentuali di stanchezza, diagnosi o valutazioni di idoneità. La quota di chiusura deve conservare il nome e il metodo sperimentale indicati nella specifica.

## 2 Responsabilità e proprietà dei file

| Area | Responsabile principale | Revisione |
| --- | --- | --- |
| Struttura del progetto, dipendenze, build e comandi | Tu | Nervo verifica le esigenze del runtime |
| Contratti e semantica temporale | Nervo | Tu verifichi il consumo dalla UI |
| Webcam, fotogrammi e rilascio delle risorse di acquisizione | Tu | Nervo verifica tempi e formato |
| MediaPipe, geometria e risorse del modello | Nervo | Tu verifichi il collegamento all'app |
| Calibrazione, stati, eventi e metriche | Nervo | Tu rivedi esempi e risultati |
| Interfaccia, grafici e controllo della sessione | Tu | Nervo verifica il significato delle misure |
| Esportazione e adattatore di integrazione | Tu | Nervo verifica unità e metadati |
| Test deterministici del motore e fixture | Nervo | Tu verifichi la modalità replay |
| Collaudo completo e documentazione | Entrambi | Revisione incrociata |

Struttura proposta, con proprietario principale tra parentesi:

```text
vision-prototype/
  package.json                 (Tu)
  package-lock.json            (Tu)
  vite.config.ts               (Tu)
  tsconfig*.json               (Tu)
  src/
    contracts/                 (Nervo, con revisione di entrambi)
    capture/                   (Tu)
    inference/                 (Nervo)
    analysis/                  (Nervo)
    integration/               (Tu)
    ui/                        (Tu)
    app/                       (Tu: collegamento dei moduli)
  public/models/               (Nervo)
  fixtures/                    (Nervo)
  tests/
    analysis/                  (Nervo)
    integration/               (Tu)
  docs/
    contracts.md               (Nervo)
    measurement-method.md      (Nervo)
    calibration.md             (Nervo)
    integration.md             (Tu)
    validation-results.md      (Entrambi, sezioni separate)
  README.md                    (Tu, con contributi di Nervo)
```

La proprietà serve a ridurre conflitti: chi deve intervenire in un'area dell'altro concorda prima la modifica. Per i file condivisi si integra una modifica alla volta.

## 3 Accordo iniziale che sblocca il lavoro parallelo

### C01 Fissare il contratto minimo

**Responsabili:** entrambi; Nervo prepara tipi ed esempi, tu li rivedi dal punto di vista dell'applicazione.  
**Dipendenze:** nessuna.

Concordare prima di collegare moduli reali:

1. **Fotogramma in ingresso all'inferenza:** rappresentazione accettata, dimensioni, timestamp monotono in millisecondi e responsabilità di rilascio dell'eventuale buffer. Il contratto deve poter supportare un Web Worker senza imporlo al motore temporale.
2. **Campione per il motore:** timestamp, apertura calibrata per ciascun occhio, valutabilità per occhio, motivi di invalidità e identificativo della calibrazione. Documentare anche unità e intervallo dei valori geometrici prima della calibrazione.
3. **API del motore:** firme di `start`, `processSample`, `getSnapshot`, `stop`, `reset`; gestione di errori e campioni rifiutati.
4. **Risultati:** aggiornamento per la UI, evento completo o incompleto, riepilogo versionato; unità e significato di `null`.
5. **Tempo:** attribuzione degli intervalli fra campioni, timestamp duplicati o fuori ordine, gap massimo, transizioni e interruzioni. Nessun tempo perso viene ricostruito come chiusura certa.
6. **Finestre:** distinguere intera sessione e finestra mobile; dichiarare come trattare un evento che attraversa il bordo della finestra. Una chiusura tagliata non deve comparire come evento completo più breve.
7. **Calibrazione:** apertura e chiusura di riferimento, separazione minima, versione e condizioni di invalidazione. Un cambio di calibrazione interrompe la continuità della misura.
8. **Configurazione:** nomi dei parametri, intervalli ammessi e identificazione dei valori effettivamente usati. I valori iniziali restano sperimentali e vengono motivati nel collaudo.
9. **Sessione applicativa:** stati di caricamento, anteprima, calibrazione, misura, arresto ed errore. Definire cosa accade se la scheda viene sospesa o l'utente cambia fotocamera.

**Consegna:** tipi in `src/contracts/`, regole in `docs/contracts.md` ed esempi coerenti di campione, evento e riepilogo, compreso un caso non disponibile.

**Completato quando:** entrambi possono scrivere un produttore o un consumatore fittizio senza inventare campi o interpretazioni. Prima di C01 si può lavorare su struttura e schermate statiche; dopo C01 i due percorsi procedono indipendentemente.

**Stato al 13 novembre 2026:** C01 v1 stabilito su delega del responsabile
dell'applicazione. Decisioni e semantica in `vision-prototype/docs/contracts.md`,
tipi in `src/contracts/`, esempi in `fixtures/contract-examples.ts` e adattatore
webcam/RGBA in `src/capture/inference-frame-adapter.ts`. N03 implementa geometria
e calibrazione su questo confine; N04 aggiungerà l'inferenza.

## 4 I tuoi task

### T01 Preparare il progetto

**Dipendenze:** nessuna; eseguibile mentre Nervo prepara C01.

- Creare il progetto React e TypeScript con Vite, verificando i requisiti dell'ambiente.
- Configurare build, controllo dei tipi e runner dei test concordato con Nervo.
- Fissare versioni e lockfile; predisporre percorsi configurabili per modello e WASM.
- Preparare struttura delle cartelle e istruzioni iniziali di avvio.

**Consegna:** progetto minimo avviabile e build riuscita. Le dipendenze del runtime richieste da Nervo vengono aggiunte da te, così il lockfile ha un solo responsabile.

### T02 Costruire l'interfaccia con un adattatore fittizio

**Dipendenze:** T01 e C01.

- Preparare controlli, video, valori dei due occhi, grafico, riepilogo e dettaglio qualità.
- Usare un produttore fittizio conforme ai contratti per simulare misura disponibile, calibrazione insufficiente, perdita del segnale ed errore.
- Gestire i pulsanti secondo lo stato della sessione ed evitare valori dimostrativi presentati come misure reali.

**Consegna:** schermata navigabile e verificabile senza MediaPipe. I dati fittizi temporanei saranno sostituiti dalle fixture ufficiali di Nervo.

### T03 Implementare acquisizione e ciclo della sessione

**Dipendenze:** T01 e contratto dei fotogrammi di C01.

- Richiedere solo la webcam, gestendo autorizzazione negata e dispositivo non disponibile.
- Inviare fotogrammi nuovi con timestamp monotoni; concordare il percorso alternativo se l'API scelta non è disponibile.
- Applicare la regola di un'elaborazione alla volta, evitando accumulo di frame.
- Gestire avvio, arresto, cambio sorgente, sospensione e rilascio della fotocamera.

**Consegna:** sorgente di fotogrammi collegabile all'adattatore di Nervo, verificata anche con un consumatore fittizio.

**Avanzamento al 13 novembre 2026:** parte applicativa implementata in
`vision-prototype/src/capture/`, con UI e 26 test automatici superati.
Il formato dei fotogrammi è stato allineato a C01 con l'adattatore RGBA; la
versione corrente del contratto applicativo è v2.
Resta il collaudo con webcam fisica, a carico dell'utente.
Dettagli in `vision-prototype/docs/capture.md`.

### T04 Collegare calibrazione e risultati alla UI

**Dipendenze:** T02, T03, N02, N03 e N04 per il percorso completo. Il collegamento può iniziare usando adattatori fittizi.

- Implementare le schermate della calibrazione usando la logica fornita da Nervo.
- Collegare la pipeline webcam → inferenza → calibrazione → motore → interfaccia.
- Mostrare overlay, stati tecnici e interruzioni del grafico senza duplicare i calcoli del motore.
- Collegare anche la modalità sintetica: cambia la sorgente, resta lo stesso motore.

**Consegna:** prima sessione completa con webcam e prima sessione riproducibile con fixture.

### T05 Implementare esportazione e consumatore separato

**Dipendenze:** C01; verifiche complete con N02 e N03.

- Esportare il riepilogo prodotto dal motore insieme ai riferimenti risolvibili di configurazione e calibrazione, oppure ai relativi oggetti nel pacchetto esportato.
- Conservare origine sintetica o webcam, versioni, unità, periodo e motivi di indisponibilità.
- Creare un consumatore separato che riceva l'oggetto dall'adattatore, senza leggere componenti React o variabili globali.
- Verificare serializzazione e coerenza fra risultato visualizzato ed esportato.

**Consegna:** JSON utilizzabile e istruzioni dell'adattatore in `docs/integration.md`.

**Avanzamento T05:** esportazione webcam e replay sintetico implementata, con
profilo, configurazioni, campioni, versioni e consumatore separato. I test
automatici verificano serializzazione e riproduzione; resta la prova manuale del
download a carico dell'utente. Dettagli in `vision-prototype/docs/integration.md`.

### T06 Verificare applicazione e preparare la consegna

**Dipendenze:** T04, T05 e N05.

- Verificare avvio e misura senza Internet dopo l'installazione e la disponibilità locale degli asset.
- Controllare caricamento da sottopercorso, arresto, riavvio, errori e assenza di richieste involontarie a CDN.
- Registrare reattività dell'interfaccia e comportamento durante sessioni ripetute.
- Completare README e sezione applicativa dei risultati di collaudo.

**Consegna:** build eseguibile, istruzioni riproducibili e limiti applicativi documentati.

## 5 Task di Nervo

### N01 Definire contratti e fixture di riferimento

**Dipendenze:** nessuna per la proposta; revisione C01 prima di considerarli stabili.

- Preparare i tipi e gli esempi richiesti da C01.
- Creare sequenze sintetiche con risultati attesi: aperto, chiusure brevi, chiusura prolungata, occhiolino, perdita del tracciamento, gap temporale e tempo valido nullo.
- Aggiungere timestamp duplicati o fuori ordine, arresto durante una chiusura e cambio calibrazione.
- Rendere le fixture consumabili dal replay senza webcam.

**Consegna:** contratti iniziali approvati da entrambi e fixture con risultati attesi documentati.

### N02 Implementare il motore temporale

**Dipendenze:** C01 e N01. Non dipende da webcam o UI.

- Implementare stati per occhio, isteresi e chiusura bilaterale.
- Gestire continuità, eventi incompleti, gap, arresto e reset.
- Calcolare tempo valido, copertura, tempo chiuso, quota di chiusura, episodi prolungati e massima chiusura completa.
- Separare aggregati di sessione e finestra mobile secondo C01.
- Verificare sequenze temporalmente equivalenti a frequenze diverse, entro i limiti del campionamento.

**Consegna:** motore TypeScript puro con test deterministici dei risultati attesi. Nessuna dipendenza da DOM, React, webcam o rete.

### N03 Implementare geometria e calibrazione

**Dipendenze:** C01. I calcoli possono essere sviluppati con punti sintetici prima di N04.

- Selezionare e documentare i punti palpebrali, la formula e la correzione delle scale dell'immagine.
- Definire i controlli di ammissibilità geometrica e i limiti del loro riconoscimento automatico.
- Implementare raccolta dei riferimenti aperto e chiuso, separazione minima e normalizzazione per occhio.
- Esporre avanzamento, esito e motivi del fallimento della calibrazione per le schermate di T04.

**Consegna:** funzioni verificabili separatamente, procedura in `docs/calibration.md` e metodo in `docs/measurement-method.md`.

### N04 Implementare l'adattatore MediaPipe

**Dipendenze:** T01 e C01; collaborazione con te per dipendenze e caricamento degli asset.

- Selezionare e fissare modello e runtime; registrare provenienza, versione, identificativo verificabile e licenze.
- Caricare modello e WASM da percorsi locali configurabili.
- Convertire l'uscita di MediaPipe nella geometria prevista da N03; gestire volto assente o osservazione ambigua.
- Esporre inizializzazione, elaborazione e rilascio delle risorse senza dipendenze dalla UI.
- Valutare l'inferenza in Web Worker e documentare il percorso compatibile alternativo.

**Consegna:** adattatore collegabile alla sorgente di T03, con errori espliciti e risorse rilasciabili.

### N05 Validare misura e prestazioni dell'inferenza

**Dipendenze:** N02, N03, N04; collaborazione con te dopo T04.

- Confrontare eventi controllati e risultati, usando annotazioni manuali quando disponibili.
- Provare occhiali, riflessi, illuminazione, rotazioni e uscita dall'inquadratura.
- Registrare frequenza di inferenza, latenza, copertura e principali falsi rilevamenti o eventi mancati.
- Documentare parametri sperimentali, macchina, browser, modello e limiti della verifica.

**Consegna:** sezione di misura in `docs/validation-results.md`. Le prove manuali senza annotazioni non vengono presentate come validazione quantitativa dell'accuratezza.

## 6 Ordine di lavoro in parallelo

Le righe indicano cicli di lavoro, non giornate o scadenze. Le durate dipendono dal tempo disponibile e dalle difficoltà del runtime.

| Ciclo | Tu | Nervo | Punto di integrazione |
| --- | --- | --- | --- |
| Avvio | T01 struttura del progetto | N01 proposta dei contratti | C01 revisione e stabilizzazione del contratto minimo |
| Primo sviluppo | T02 UI fittizia e T03 acquisizione | N02 motore e fixture | La UI visualizza risultati del motore su dati sintetici |
| Pipeline visiva | T05 esportazione e preparazione di T04 | N03 geometria e calibrazione, N04 MediaPipe | Webcam e adattatore scambiano frame e osservazioni conformi |
| Collegamento completo | T04 calibrazione, grafici e sessione | Completamento N03 e N04, supporto al collegamento | Prima sessione webcam completa ed esportabile |
| Consegna | T06 applicazione e README | N05 misura e prestazioni | Collaudo congiunto e revisione finale |

Se MediaPipe richiede più tempo, puoi completare UI, replay ed esportazione usando il motore e le fixture. Se l'interfaccia richiede più tempo, Nervo può continuare a verificare misura e inferenza attraverso un consumatore tecnico minimo.

## 7 Regole pratiche di collaborazione

1. **Un responsabile per il progetto di base.** Tu gestisci configurazione, dipendenze e lockfile. Nervo comunica le esigenze prima delle modifiche.
2. **Contratti condivisi e modifiche esplicite.** Nervo propone una variazione indicando quali produttori e consumatori cambiano; entrambi la rivedete prima di integrarla. I cambiamenti incompatibili dello schema richiedono una nuova versione.
3. **Sviluppo su rami separati.** Dopo aver predisposto un repository condiviso, usare ad esempio `feature/vision-app` e `feature/vision-engine`. Integrare prima struttura e contratti, poi piccoli gruppi di task completati.
4. **Consegne piccole e verificabili.** Ogni passaggio riporta task, file interessati, modo per provarlo, risultato atteso e limiti ancora aperti.
5. **Un solo calcolo delle metriche.** La UI e l'esportazione consumano lo stesso risultato del motore; non ricalcolano durate o percentuali.
6. **Prove registrate.** Ogni risultato distingue fixture, chiusure volontarie e osservazioni spontanee; riporta configurazione e versioni.
7. **Coordinamento per ciclo.** All'inizio di ogni ciclo confrontare attività completate, dipendenze e cambiamenti ai contratti. Non aspettare la consegna finale per collegare i due percorsi.

## 8 Verifica finale congiunta

| Criterio | Chi prepara la verifica | Condizione di completamento |
| --- | --- | --- |
| Calcoli deterministici | Nervo | Fixture, eventi, gap e aggregati corrispondono ai risultati attesi |
| Calibrazione | Nervo | Condizioni distinguibili accettate; riferimenti insufficienti rifiutati con motivo |
| Sessione applicativa | Tu | Avvio, arresto, riavvio e gestione errori funzionano senza risorse lasciate attive |
| Qualità visibile | Tu | Dati assenti e intervalli invalidi sono distinguibili dagli occhi aperti |
| Coerenza dei risultati | Entrambi | UI, replay ed esportazione usano gli stessi risultati del motore |
| Funzionamento locale | Tu | Modello e runtime caricati senza CDN durante l'esecuzione |
| Prestazioni | Entrambi | Misure registrate sul PC di prova e comportamento accettabile rispetto al budget concordato |
| Integrazione futura | Tu | Un consumatore separato riceve il riepilogo senza dipendere dalla UI |
| Documentazione | Entrambi | Avvio, versioni, licenze, contratti, metodo, prove e limiti sono consultabili |

Il budget di prestazioni e i criteri quantitativi per il collaudo webcam vanno concordati prima delle prove finali. Il completamento del prototipo attesta il comportamento tecnico osservato, non la validazione clinica della misura.

## 9 Prime attività da prendere in carico

- [x] **Tu — T01:** creare struttura, configurazione e comandi del progetto. Completato il 13 novembre 2026; verifiche e istruzioni in `vision-prototype/README.md`.
- [x] **Nervo — N01:** proposta di contratti, fixture e risultati attesi in
  `vision-prototype/src/contracts/`, `vision-prototype/fixtures/` e
  `vision-prototype/docs/contracts.md`. Completato il 13 novembre 2026; revisione
  C01 conclusa su delega del responsabile dell'applicazione.
- [x] **C01:** contratti v2, politica temporale e dati mancanti stabiliti; webcam allineata al formato RGBA. Decisioni in `vision-prototype/docs/contracts.md`.
- [x] **Tu — T02:** interfaccia e replay sintetico implementati e verificati automaticamente.
- [ ] **Tu — T03:** acquisizione implementata; collaudo con webcam fisica ancora da completare.
- [ ] **Tu — T04:** pipeline e UI collegate; prima sessione completa con webcam fisica ancora da verificare.
- [ ] **Tu — T05:** esportazione e consumatore implementati; prova manuale del download ancora da completare.
- [ ] **Tu — T06:** collaudo applicativo, offline e sottopercorso ancora da eseguire.
- [x] **Nervo — N02:** motore temporale, replay e test deterministici in
  `vision-prototype/src/analysis/` e `vision-prototype/tests/analysis/`.
  Completato il 13 novembre 2026; contratti e fixture confermati in C01 v1.
- [x] **Nervo — N03:** geometria EAR, controlli di ammissibilità, calibrazione,
  normalizzazione e test in `vision-prototype/src/analysis/`,
  `vision-prototype/tests/analysis/`, `vision-prototype/docs/calibration.md` e
  `vision-prototype/docs/measurement-method.md`. Completato il 13 novembre 2026;
  indici MediaPipe e soglie restano da verificare con N04/N05.
- [x] **Nervo — N04:** adattatore MediaPipe, asset locali verificati, conversione
  landmark e collegamento strutturale a T03 in `vision-prototype/src/inference/`,
  `vision-prototype/public/models/` e `vision-prototype/docs/inference.md`.
  Completato il 13 novembre 2026; caricamento reale, CPU/GPU, Worker e prestazioni
  restano da verificare con T04/N05.
- [ ] **Nervo — N05:** harness di confronto eventi, riepilogo prestazioni,
  protocollo e risultati sintetici in `vision-prototype/src/validation/`,
  `vision-prototype/tests/validation/` e
  `vision-prototype/docs/validation-results.md`. Preparazione completata il
  13 novembre 2026; la validazione quantitativa con webcam e annotazioni reali
  resta da eseguire con T04/T05 già disponibili. La sessione registra le latenze
  ed esporta report con contesto; il confronto richiede annotazioni reali.

Lo stato distingue implementazione verificata automaticamente e collaudo manuale ancora aperto.
