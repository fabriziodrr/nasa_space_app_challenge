/** Browser text-to-speech with a natural Italian voice selection and cancellation. */
export interface SpeakHandle { cancel(): void }
export interface SpeakOptions { rate?: number; pitch?: number }

let cachedVoices: SpeechSynthesisVoice[] | null = null;

function allVoices(): SpeechSynthesisVoice[] {
  if (!("speechSynthesis" in window)) return [];
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  if (voices.length) cachedVoices = voices;
  else if (cachedVoices === null) {
    // Some browsers populate the list asynchronously.
    synth.addEventListener("voiceschanged", () => { cachedVoices = synth.getVoices(); }, { once: true });
  }
  return cachedVoices ?? voices;
}

/** Prefer neural ("Natural"/"Online") Italian voices, then Google's, then it-IT. */
export function pickItalianVoice(): SpeechSynthesisVoice | null {
  const italian = allVoices().filter((voice) => voice.lang.toLowerCase().startsWith("it"));
  if (!italian.length) return null;
  const rank = (voice: SpeechSynthesisVoice): number => {
    const name = voice.name.toLowerCase();
    if (name.includes("natural") || name.includes("online")) return 0;
    if (name.includes("google")) return 1;
    if (voice.lang.toLowerCase() === "it-it") return 2;
    return 3;
  };
  return [...italian].sort((a, b) => rank(a) - rank(b))[0];
}

export function speakItalian(
  text: string,
  onEnd: () => void,
  onError: (message: string) => void,
  options: SpeakOptions = {},
): SpeakHandle {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    onError("Lettura vocale non disponibile. Puoi leggere la risposta sopra.");
    return { cancel() {} };
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "it-IT";
  const voice = pickItalianVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = options.rate ?? 1;
  utterance.pitch = options.pitch ?? 1;
  utterance.onend = () => onEnd();
  utterance.onerror = () => onError("Impossibile riprodurre la risposta. Puoi leggerla sopra.");
  synth.speak(utterance);
  return { cancel() { synth.cancel(); } };
}
