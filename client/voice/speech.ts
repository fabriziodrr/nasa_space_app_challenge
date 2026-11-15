/** Browser text-to-speech with a natural English voice selection and cancellation. */
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

/** Prefer neural ("Natural"/"Online") English voices, then Google's, then en-US. */
export function pickEnglishVoice(): SpeechSynthesisVoice | null {
  const english = allVoices().filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  if (!english.length) return null;
  const rank = (voice: SpeechSynthesisVoice): number => {
    const name = voice.name.toLowerCase();
    if (name.includes("natural") || name.includes("online")) return 0;
    if (name.includes("google")) return 1;
    if (voice.lang.toLowerCase() === "en-us") return 2;
    return 3;
  };
  return [...english].sort((a, b) => rank(a) - rank(b))[0];
}

export function speakEnglish(
  text: string,
  onEnd: () => void,
  onError: (message: string) => void,
  options: SpeakOptions = {},
): SpeakHandle {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
    onError("Voice playback is not available. You can read the reply above.");
    return { cancel() {} };
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  const voice = pickEnglishVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = options.rate ?? 1;
  utterance.pitch = options.pitch ?? 1;
  utterance.onend = () => onEnd();
  utterance.onerror = () => onError("Unable to play the reply. You can read it above.");
  synth.speak(utterance);
  return { cancel() { synth.cancel(); } };
}
