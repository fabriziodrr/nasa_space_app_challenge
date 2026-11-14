# Procedura di calibrazione — N03

Implementazione **N03**, integrata con C01 v2. La logica è in
`src/analysis/calibration.ts`; la formula e i controlli geometrici sono in
[docs/measurement-method.md](measurement-method.md). La schermata applicativa
è collegata da T04. Non è una validazione clinica.

## 1 Precondizioni

Prima di raccogliere i riferimenti:

- il volto è interamente nell'inquadratura e il tracciamento è stabile;
- illuminazione sufficiente, senza riflessi forti sugli occhi;
- l'utente toglie o segnala occhiali che modificano la geometria palpebrale;
- la webcam è avviata e i timestamp dei campioni sono monotoni;
- la configurazione geometrica e di calibrazione è quella che verrà conservata
  nel risultato.

La calibrazione non corregge problemi di posa del capo, occlusione o qualità del
modello. Se la geometria è inaffidabile, i riferimenti devono essere rifiutati
invece di essere accettati come misura.

## 2 Sequenza guidata

1. **Preparazione.** Mostrare le istruzioni e verificare che entrambi gli occhi
   siano valutabili. La UI può usare `getProgress()` per mostrare i conteggi.
2. **Fase aperto.** Chiamare `beginPhase('open')`; l'utente guarda avanti e tiene
   gli occhi aperti. Per ogni osservazione geometrica valida chiamare
   `addSample(observation)`.
3. **Fase chiuso.** Chiamare `beginPhase('closed')`; l'utente chiude entrambi gli
   occhi senza strizzarli. Continuare a offrire i campioni.
4. **Conclusione.** Quando entrambe le fasi sono complete, chiamare
   `finish({ id, capturedAtMs })` con un identificativo creato
   dall'applicazione. Conservare l'esito e il profilo restituiti.

L'API non usa orologio, DOM o rete. La UI crea identificativo e timestamp e
decide quando avanzare, così il replay e i test restano deterministici.

## 3 Raccolta e avanzamento

`CalibrationCollector` mantiene campioni separati per occhio e fase. Un occhio
non valutabile viene ignorato: non produce un valore `0` e non contribuisce alla
mediana. Ogni occhio raccoglie al massimo il numero richiesto di campioni per
fase: se l'altro occhio resta non valutabile, la raccolta non cresce senza limite.

Configurazione iniziale:

| Parametro | Valore | Effetto |
| --- | --- | --- |
| `requiredSamplesPerEye` | 8 | campioni validi richiesti per occhio in ogni fase |
| `maxReferenceDeviation` | 0.05 | massimo scostamento dalla mediana |
| `minimumSeparation` | 0.05 | minima differenza aperto − chiuso |

`getProgress()` restituisce:

- `status`: `idle`, `collecting`, `ready`, `completed` o `failed`;
- `activePhase`: `open`, `closed` o `null`;
- `open` e `closed`: campioni per occhio, `requiredPerEye`, `complete` e
  `fraction` (0–1, limitata al minimo fra i due occhi).

`fraction` serve solo all'avanzamento visivo. La calibrazione è completa quando
entrambe le fasi hanno abbastanza campioni validi per entrambi gli occhi.

## 4 Esito e motivi di fallimento

`finish()` produce un `CalibrationOutcome` anche quando fallisce. In caso di
fallimento `profile` è `null`, ma sono disponibili campioni, mediane,
scostamenti e motivi per occhio.

| Motivo | Significato | Azione suggerita per T04 |
| --- | --- | --- |
| `not_enough_open_samples` | meno campioni aperti del richiesto per quell'occhio | ripetere la fase aperto con il volto più stabile |
| `not_enough_closed_samples` | meno campioni chiusi del richiesto | ripetere la fase chiuso, evitando di strizzare gli occhi |
| `unstable_open` | troppa variabilità nella fase aperto | migliorare illuminazione o posa e ripetere |
| `unstable_closed` | troppa variabilità nella fase chiuso | ripetere la chiusura senza movimento |
| `separation_too_small` | aperto e chiuso sono troppo simili | verificare che gli occhi si chiudano davvero e ripetere |

L'esito complessivo riesce solo se entrambi gli occhi hanno riferimenti validi.
Se un solo occhio fallisce, la UI deve mostrare il motivo per quel lato e non
avviare una misura bilaterale con un profilo incompleto.

Una calibrazione riuscita contiene:

```ts
interface CalibrationProfile {
  id: string;
  version: string;
  methodVersion: string;
  capturedAtMs: number;
  normalization: 'open-closed-v1';
  eyes: {
    left: { open: number; closed: number; minimumSeparation: number };
    right: { open: number; closed: number; minimumSeparation: number };
  };
}
```

Il profilo va conservato con la sessione e con l'esportazione. Il motore
temporale usa `id` per riconoscere un cambio di calibrazione: la misura si
interrompe e gli episodi in corso diventano incompleti.

## 5 Esempio d'uso

```ts
import {
  CalibrationCollector,
  toAnalysisSample,
} from '../src/analysis/calibration';

const collector = new CalibrationCollector();
collector.start(); // fase aperto

// Per ogni FaceGeometryObservation prodotta da N04:
collector.addSample(openObservation);

collector.beginPhase('closed');
collector.addSample(closedObservation);

const outcome = collector.finish({
  id: `cal-${sessionId}`,
  capturedAtMs: Date.now(), // metadato UTC Unix, non il tempo monotono dei frame
});

if (outcome.success && outcome.profile !== null) {
  const sample = toAnalysisSample(geometryObservation, outcome.profile);
  engine.processSample(sample);
}
```

`start()` è una scorciatoia per `reset()` seguito da `beginPhase('open')`.
`reset()` cancella campioni, avanzamento ed esito. Dopo un esito concluso,
`beginPhase()` riparte con una raccolta nuova.

Per collegare l'esito allo stato applicativo C01 usare
`toCalibrationState(collector.getProgress(), outcome)`. Il `ready` tecnico della
raccolta non equivale a un profilo valido: serve `finish()` riuscito. I motivi
dettagliati N03 sono conservati nell'esito e tradotti nei codici applicativi C01.
`methodVersion` viene raccolto dalle osservazioni e conservato nel profilo;
un cambio di metodo richiede `reset()` e una nuova calibrazione. Il modulo
rifiuta la normalizzazione di osservazioni con un metodo diverso dal profilo.

## 6 Errori d'uso

`CalibrationStateError` viene lanciato se:

- si chiama `addSample()` senza una fase attiva o dopo la conclusione;
- si chiama `finish()` con `id` vuoto o `capturedAtMs` non valido;
- si passa una fase non riconosciuta.
- si mescolano metodi geometrici durante la raccolta o si tenta di normalizzare
  con un metodo diverso da quello conservato nel profilo.

Questi sono errori di programmazione della UI, distinti dai fallimenti di
qualità, che sono restituiti in `CalibrationOutcome.reasons`.

## 7 Dati da conservare

Per riprodurre la normalizzazione servono:

- `CalibrationProfile` completo;
- configurazione geometrica (`configId` e valori);
- configurazione di calibrazione (`configId` e valori);
- `methodVersion` della geometria;
- timestamp e identificativo della raccolta.

## 8 Limiti

- La procedura assume pixel quadrati e punti MediaPipe correttamente associati.
- Non rileva occhiali, riflessi, occlusione parziale o sguardo deviato.
- Le soglie iniziali sono sperimentali e vanno verificate in N05.
- Una calibrazione riuscita attesta la coerenza geometrica dei riferimenti, non
  l'accuratezza clinica della misura.
