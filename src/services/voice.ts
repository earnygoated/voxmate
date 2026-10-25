export interface VoiceServiceHandlers {
  onStart: () => void;
  onResult: (transcript: string) => void;
  onError: (error: string) => void;
  onEnd: () => void;
}

export function isSpeechRecognitionSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );
}

export function createSpeechRecognizer(handlers: VoiceServiceHandlers) {
  if (!isSpeechRecognitionSupported()) return null;
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    handlers.onStart();
  };

  recognition.onresult = (e: any) => {
    const transcript = e.results?.[0]?.[0]?.transcript || '';
    if (transcript) {
      handlers.onResult(transcript);
    }
  };

  recognition.onerror = (e: any) => {
    handlers.onError(e.error || 'Microphone error');
  };

  recognition.onend = () => {
    handlers.onEnd();
  };

  return recognition;
}

export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices();
}

export function speakText(text: string, voiceName: string, rate: number = 0.95) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = Math.max(0.7, Math.min(1.3, rate || 0.95));
  
  const voices = window.speechSynthesis.getVoices();
  const chosen = voices.find(v => v.name === voiceName);
  if (chosen) {
    utterance.voice = chosen;
    utterance.lang = chosen.lang;
  } else {
    utterance.lang = 'en-US';
  }
  
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
