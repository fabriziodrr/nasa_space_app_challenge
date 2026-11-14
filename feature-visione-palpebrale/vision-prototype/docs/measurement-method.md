# Metodo di misura — N02/N03

Metodo temporale **N02**, confermato in C01 v1, e geometria/calibrazione **N03**,
13 novembre 2026. I moduli sono in `src/analysis/geometry.ts` e
`src/analysis/calibration.ts`; i valori sperimentali saranno verificati in N05.
Il documento descrive formula palpebrale, calibrazione e trasformazione dei
campioni in durate e quote. Non è una validazione clinica.

## 1 Punti palpebrali e formula EAR

Per ogni occhio si usano sei punti, nell'ordine del modello di Soukupová e Čech:

| Nome | Ruolo |
| --- | --- |
| `p1` `outerCorner` | angolo esterno |
| `p2` `upperOuter` | punto superiore esterno |
| `p3` `upperInner` | punto superiore interno |
| `p4` `innerCorner` | angolo interno |
| `p5` `lowerInner` | punto inferiore interno |
| `p6` `lowerOuter` | punto inferiore esterno |

La formula, calcolata in pixel, è:

```text
EAR = (d(p2, p6) + d(p3, p5)) / (2 * d(p1, p4))
```

`EAR` è un rapporto adimensionale non negativo. In condizioni normali il valore
aperto è maggiore del valore chiuso; non viene interpretato come percentuale di
apertura o di stanchezza.

Indici usati dall'adattatore N04 per MediaPipe Face Mesh, da verificare ancora
sul modello reale in T04/N05:

| Occhio della persona | p1 | p2 | p3 | p4 | p5 | p6 |
| --- | --- | --- | --- | --- | --- | --- |
| destro | 33 | 160 | 158 | 133 | 153 | 144 |
| sinistro | 362 | 385 | 387 | 263 | 373 | 380 |

La mappatura è esportata in `MEDIAPIPE_FACE_MESH_EYELID_INDICES` e N03 non importa
MediaPipe.

## 2 Correzione delle scale dell'immagine

I punti possono arrivare in pixel oppure in coordinate normalizzate. Nel secondo
caso:

```text
x_px = x_normalizzato * larghezza_immagine
y_px = y_normalizzato * altezza_immagine
```

Tutte le distanze della formula vengono calcolate dopo questa conversione. In
questo modo un'immagine non quadrata o una risoluzione diversa non altera il
rapporto. Si assume che i pixel siano quadrati; eventuali scale anomale del
dispositivo non sono corrette da N03.

`methodVersion = n03-ear-v1` identifica punti, formula e correzione delle scale.

## 3 Ammissibilità geometrica

Prima di produrre un rapporto valido, `calculateEyeGeometry` controlla:

| Controllo | Configurazione iniziale | Motivo se fallisce |
| --- | --- | --- |
| Dimensioni immagine finite e positive | obbligatorio | `geometry_invalid` |
| Punti finiti e presenti | obbligatorio | `landmark_missing` |
| Punti dentro l'immagine | tolleranza 1 px | `out_of_range` |
| Larghezza orizzontale sufficiente | `minEyeWidthPx = 8` | `geometry_invalid` |
| Rapporto non implausibile | `maxEyeAspectRatio = 1.2` | `geometry_invalid` |

Le soglie sono in `DEFAULT_GEOMETRY_CONFIG` e possono essere ridefinite tramite
`resolveGeometryConfig`, che produce un `configId` con i valori usati. I controlli
sono solo di plausibilità geometrica: non riconoscono automaticamente occhiali,
riflessi, occlusione parziale, sguardo, rotazioni del capo o landmark associati
all'occhio sbagliato. Questi limiti vanno verificati in N05.

## 4 Riferimenti di calibrazione

La calibrazione raccoglie campioni per ciascun occhio in due fasi:

1. **aperto**: l'utente guarda avanti e tiene entrambi gli occhi aperti;
2. **chiuso**: l'utente chiude entrambi gli occhi senza strizzarli.

Per ogni fase il motore conserva i valori EAR validi e calcola la mediana per
occhio. Il valore mediano riduce l'effetto di singoli campioni anomali. Un occhio
non valutabile non contribuisce alla mediana.

Configurazione iniziale:

| Parametro | Valore | Significato |
| --- | --- | --- |
| `requiredSamplesPerEye` | 8 | campioni validi minimi per occhio e fase |
| `maxReferenceDeviation` | 0.05 | scostamento massimo dalla mediana |
| `minimumSeparation` | 0.05 | differenza minima fra aperto e chiuso |

La calibrazione riesce per un occhio solo se:

- ci sono abbastanza campioni validi in entrambe le fasi;
- lo scostamento massimo dalla mediana non supera `maxReferenceDeviation`;
- `mediana_aperto - mediana_chiuso >= minimumSeparation`.

I motivi di fallimento esposti per occhio sono:
`not_enough_open_samples`, `not_enough_closed_samples`, `unstable_open`,
`unstable_closed`, `separation_too_small`. L'esito complessivo riesce solo se
entrambi gli occhi riescono.

Una calibrazione riuscita produce `CalibrationProfile` con:

- `id` e `version`;
- `methodVersion` effettivamente usato nella raccolta;
- `capturedAtMs`;
- `normalization: 'open-closed-v1'`;
- riferimenti `open`, `closed` e `minimumSeparation` per occhio.

La procedura operativa e i messaggi per T04 sono in
[docs/calibration.md](calibration.md). Un cambio di `id` interrompe la continuità
della misura nel motore temporale.

## 5 Apertura normalizzata

Per ogni occhio e campione geometrico valido:

```text
openness = (EAR - riferimento_chiuso) / (riferimento_aperto - riferimento_chiuso)
```

Con la normalizzazione `open-closed-v1`:

- `openness = 0` corrisponde al riferimento chiuso;
- `openness = 1` corrisponde al riferimento aperto;
- valori fuori da [0, 1] sono ammessi come rumore e non vengono tagliati dal
  motore;
- un occhio non valutabile produce un campione `invalid`, non un valore
  numerico.

La funzione `normalizeOpenness` richiede una separazione positiva. Il passaggio
da `FaceGeometryObservation` a `AnalysisSample` avviene con
`calibrateFaceGeometry` o `toAnalysisSample`.

## 6 Stati e isteresi

Per ciascun occhio:

```text
se stato = closed:   openness >= openExit   -> open, altrimenti resta closed
altrimenti:          openness <= closedEnter -> closed, altrimenti open
```

La banda `closedEnter < openness < openExit` evita oscillazioni attorno a una
singola soglia. Un campione invalido porta l'occhio a `unknown`; non equivale a
occhio aperto.

La chiusura bilaterale richiede entrambi gli occhi valutabili e chiusi. Un
occhiolino produce lo stato `mixed` e non aumenta il tempo chiuso bilaterale.

## 7 Attribuzione degli intervalli

Lo stato del campione si applica all'intervallo fino al campione successivo
(`sample-and-hold`). Per due campioni accettati a `t_i` e `t_{i+1}`:

```text
intervallo = t_{i+1} - t_i
```

Se l'intervallo supera `maxGapMs` è un gap. Gap e cambi di calibrazione non
contribuiscono al tempo valido o chiuso. Un campione invalido rende non valido
l'intervallo successivo; l'intervallo precedente resta attribuito all'ultimo
stato valido.

L'ultimo campione non viene prolungato fino all'istante di arresto. Un evento
ancora aperto a `stop()` diventa incompleto e conserva solo la durata osservata
fino all'ultimo campione.

## 8 Tempo valido e copertura

Per la coppia bilaterale:

```text
validMs = somma degli intervalli senza gap, senza cambio calibrazione,
          con entrambi gli occhi valutabili al campione di partenza

coverage = validMs / elapsedMs
```

`elapsedMs` comprende gap, transizioni di calibrazione e intervalli con dati
mancanti. Se `elapsedMs` è zero, `coverage` è `null`. Se il tempo osservato è
positivo ma non ci sono dati validi, `coverage` è `0`.

Per i singoli occhi si applica la stessa somma usando solo la valutabilità di
quell'occhio. Il tempo bilaterale valido non è la media dei due occhi.

## 9 Tempo chiuso e quota di chiusura

```text
closedMs = somma degli intervalli validi con stato bilaterale closed
closureFraction = closedMs / validMs
```

`closureFraction` è la quota temporale di chiusura sperimentale. Vale `null` se
`validMs` è zero. Non viene mai ricalcolata dalla UI o dall'esportazione: tutti
i consumatori leggono il valore del motore.

`openMs = validMs - closedMs`. `unknownMs = elapsedMs - validMs` racchiude gap,
transizioni e dati mancanti; `gapMs` e `calibrationTransitionMs` ne sono
sottoinsiemi espliciti.

## 10 Episodi

Un episodio inizia quando l'occhio o la coppia passa a `closed` e termina quando
si riapre con continuità. È completo solo con causa `reopened`. Perdita del
tracciamento, gap, cambio calibrazione e arresto producono episodi incompleti.

- **Chiusura prolungata:** evento completo con durata almeno
  `prolongedClosureMs`.
- **Massima chiusura completa:** massima durata fra gli eventi completi; `null`
  se non ce ne sono.
- **Massima durata osservata:** include anche eventi incompleti o in corso.

Nella finestra mobile un evento tagliato dal bordo resta visibile con la durata
reale e con `completeWithinWindow: false`; non viene contato come chiusura
completa più breve.

## 11 Frequenza di campionamento

Il motore usa i timestamp, non il numero di campioni. Due sequenze con gli stessi
istanti di transizione e frequenze diverse producono le stesse durate entro la
risoluzione del campionamento. I test verificano la stessa sequenza a 10 Hz e
20 Hz (100 ms e 50 ms), mentre N05 dovrà misurare il limite pratico con la
pipeline reale.

Eventi più brevi dell'intervallo fra campioni possono non essere osservati. Le
fixture non attribuiscono a questa eventualità un tempo chiuso certo.

## 12 Limiti

- Le soglie iniziali (`closedEnter = 0.25`, `openExit = 0.4`) sono sperimentali.
- Le soglie geometriche e di calibrazione sono sperimentali e vanno riviste in
  N05.
- La normalizzazione dipende dalla qualità dei riferimenti N03.
- Occhiali, riflessi, rotazioni e perdita del volto richiedono la verifica N05.
- Le misure descrivono il comportamento osservato e non producono diagnosi,
  percentuali di stanchezza o giudizi di idoneità.
