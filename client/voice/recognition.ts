/** Minimal browser speech-recognition types: not all TypeScript DOM libraries expose this API. */
export interface SpeechAlternative { transcript: string }
export interface SpeechResult { isFinal: boolean; readonly 0: SpeechAlternative }
export interface SpeechResults { readonly length: number; readonly [index: number]: SpeechResult }
export interface SpeechResultEvent { results: SpeechResults }
export interface SpeechErrorEvent { error: string }
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type RecognitionConstructor = new () => Recognition;
export interface RecognitionWindow {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
}
export interface RecognitionCallbacks {
  onText(finalText: string, interimText: string): void;
  onEnd(hadFinalText: boolean): void;
  onError(message: string, code?: string): void;
}

export function recognitionError(code: string): string {
  switch (code) {
    case "not-allowed": case "service-not-allowed": return "Permesso del microfono negato o servizio vocale non disponibile.";
    case "audio-capture": return "Nessun microfono disponibile. Controlla il dispositivo.";
    case "network": return "Il servizio di riconoscimento non è raggiungibile. Puoi scrivere il messaggio.";
    case "no-speech": return "Non ho rilevato parole. Riprova oppure scrivi il messaggio.";
    case "aborted": return "Registrazione interrotta.";
    default: return "Riconoscimento vocale non riuscito. Riprova oppure scrivi il messaggio.";
  }
}

/** One recognition turn; the caller owns editable text and decides when to send. */
export class BrowserVoiceInput {
  private recognition: Recognition | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private hadFinal = false;
  private failed = false;
  constructor(private readonly source: RecognitionWindow, private readonly callbacks: RecognitionCallbacks) {}

  get supported(): boolean { return Boolean(this.source.SpeechRecognition ?? this.source.webkitSpeechRecognition); }

  start(): void {
    if (this.disposed || this.recognition) throw new Error("Riconoscimento già avviato o non disponibile.");
    const Constructor = this.source.SpeechRecognition ?? this.source.webkitSpeechRecognition;
    if (!Constructor) throw new Error("Il browser non supporta il riconoscimento vocale. Puoi scrivere il messaggio.");
    const recognition = new Constructor();
    this.recognition = recognition;
    this.hadFinal = false;
    this.failed = false;
    recognition.lang = "it-IT";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      if (this.disposed) return;
      const final: string[] = [];
      const interim: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        (result.isFinal ? final : interim).push(result[0].transcript.trim());
      }
      const text = final.filter(Boolean).join(" ");
      if (text) this.hadFinal = true;
      this.callbacks.onText(text, interim.filter(Boolean).join(" "));
    };
    recognition.onerror = (event) => {
      if (this.disposed) return;
      this.failed = true;
      this.callbacks.onError(recognitionError(event.error), event.error);
    };
    recognition.onend = () => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.recognition = null;
      if (!this.disposed) this.callbacks.onEnd(this.hadFinal || this.failed);
    };
    try {
      recognition.start();
      this.timer = setTimeout(() => this.stop(), 120_000);
    } catch (error) {
      this.recognition = null;
      throw error;
    }
  }

  stop(): void {
    if (this.recognition) {
      try { this.recognition.stop(); } catch { /* Browser may already have stopped. */ }
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const recognition = this.recognition;
    this.recognition = null;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.abort(); } catch { /* Already stopped. */ }
    }
  }
}
