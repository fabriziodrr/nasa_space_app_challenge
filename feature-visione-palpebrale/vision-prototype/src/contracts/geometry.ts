import type { EyeInvalidityReason, EyeSide } from './sample';

/** Punto bidimensionale in coordinate immagine. */
export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/** Dimensioni dell'immagine da cui provengono i punti. */
export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

/**
 * Spazio delle coordinate in ingresso.
 *
 * `normalized` usa x/w e y/h in [0, 1] come nell'uscita tipica di MediaPipe.
 * `pixels` usa direttamente le coordinate in pixel dell'immagine.
 */
export type GeometryCoordinateSpace = 'normalized' | 'pixels';

/**
 * I sei punti palpebrali usati dalla formula EAR.
 *
 * L'ordine segue il modello di Soukupová e Čech:
 * p1 = angolo esterno, p2 = punto superiore esterno, p3 = punto superiore
 * interno, p4 = angolo interno, p5 = punto inferiore interno, p6 = punto
 * inferiore esterno. I nomi descrivono la posizione lungo la palpebra, non il
 * lato sinistro o destro dell'immagine.
 */
export interface EyelidLandmarks {
  readonly outerCorner: Point2D;
  readonly upperOuter: Point2D;
  readonly upperInner: Point2D;
  readonly innerCorner: Point2D;
  readonly lowerInner: Point2D;
  readonly lowerOuter: Point2D;
}

/**
 * Punti palpebrali grezzi di un volto a un determinato istante.
 *
 * Il produttore deve dichiarare dimensioni e spazio delle coordinate. La
 * correzione delle scale usa `imageWidth`/`imageHeight`: i punti normalizzati
 * vengono riportati in pixel prima del calcolo, evitando che un'immagine non
 * quadrata alteri il rapporto.
 */
export interface FaceLandmarks {
  readonly timestampMs: number;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly coordinateSpace: GeometryCoordinateSpace;
  readonly left: EyelidLandmarks;
  readonly right: EyelidLandmarks;
}

/**
 * Geometria grezza di un occhio, prima della normalizzazione di calibrazione.
 *
 * `eyeAspectRatio` è il rapporto adimensionale prodotto dalla formula N03 ed è
 * assente quando l'osservazione non è ammissibile. `horizontalWidthPx` è la
 * distanza fra gli angoli palpebrali in pixel; serve a diagnosi e controlli.
 * Il motore temporale non legge questa struttura e consuma solo
 * `AnalysisSample`.
 */
export type EyeGeometryObservation =
  | {
      readonly side: EyeSide;
      readonly horizontalWidthPx: number;
      readonly eyeAspectRatio: number;
      readonly valid: true;
      readonly invalidityReasons: readonly [];
    }
  | {
      readonly side: EyeSide;
      readonly horizontalWidthPx: number;
      readonly eyeAspectRatio?: never;
      readonly valid: false;
      readonly invalidityReasons: readonly [EyeInvalidityReason, ...EyeInvalidityReason[]];
    };

/**
 * Osservazione geometrica del volto a un determinato istante.
 *
 * `methodVersion` identifica punti palpebrali, formula e correzione delle scale
 * dell'immagine. La geometria è documentata in `docs/measurement-method.md`.
 */
export interface FaceGeometryObservation {
  readonly timestampMs: number;
  readonly methodVersion: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly left: EyeGeometryObservation;
  readonly right: EyeGeometryObservation;
}
