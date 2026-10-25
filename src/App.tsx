import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mode, ChatMessage, AppSettings } from './types';
import { Topbar } from './components/Topbar';
import { WelcomeCard } from './components/WelcomeCard';
import { TaskDesk } from './components/TaskDesk';
import { ChatSection } from './components/ChatSection';
import { QuickActions } from './components/QuickActions';
import { SettingsModal } from './components/SettingsModal';
import {
  DEFAULT_BACKEND_URL,
  DEFAULT_RATE,
  cleanFeedback,
  checkBackendHealth,
  sendChatMessage
} from './services/chat';
import {
  isSpeechRecognitionSupported,
  createSpeechRecognizer,
  speakText,
  stopSpeaking
} from './services/voice';

export const App: React.FC = () => {
  const [mode, setMode] = useState<Mode>('coach');
  const [settings, setSettings] = useState<AppSettings>(() => {
    return {
      backendUrl: localStorage.getItem('voxmate_backend_url') ?? DEFAULT_BACKEND_URL,
      accessCode: localStorage.getItem('voxmate_access_code') ?? '',
      speechRate: Number(localStorage.getItem('voxmate_rate') ?? DEFAULT_RATE),
      voiceName: localStorage.getItem('voxmate_voice') ?? ''
    };
  });

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      role: 'assistant',
      text: "Hi! I'm VoxMate. Choose a mode, then tap the microphone or type a message. In coach mode, we'll focus on speaking first and feedback second."
    }
  ]);
  const [latestFeedback, setLatestFeedback] = useState<string | undefined>(undefined);
  const [isListening, setIsListening] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState('Checking backend…');
  const [status, setStatus] = useState<string>('Demo mode');
  const [voiceAvailable, setVoiceAvailable] = useState(false);

  const recognizerRef = useRef<any>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const isBusyRef = useRef(isBusy);
  isBusyRef.current = isBusy;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const addMessage = useCallback((role: 'assistant' | 'user' | 'system', text: string) => {
    const newMsg: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      role,
      text,
      timestamp: Date.now()
    };
    setMessages((prev) => [...prev, newMsg]);
    return newMsg;
  }, []);

  const runHealthCheck = useCallback(async () => {
    const res = await checkBackendHealth(settingsRef.current.backendUrl);
    setHealthStatus(res.message);
  }, []);

  useEffect(() => {
    const isConfigured = Boolean(settings.backendUrl && settings.accessCode);
    setStatus(isConfigured ? 'AI configured' : 'Demo mode');
    runHealthCheck();
    const interval = setInterval(runHealthCheck, 60000);
    return () => clearInterval(interval);
  }, [settings.backendUrl, settings.accessCode, runHealthCheck]);

  // Main asking/interaction function
  const handleAsk = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!clean || isBusyRef.current) return;

    addMessage('user', clean);
    setIsBusy(true);
    setStatus('Thinking…');

    try {
      const history = messagesRef.current
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-10)
        .map((m) => ({ role: m.role, text: m.text }));

      const rawAnswer = await sendChatMessage(
        settingsRef.current.backendUrl,
        settingsRef.current.accessCode,
        modeRef.current,
        clean,
        history
      );

      const { spokenText, feedbackText } = cleanFeedback(rawAnswer);
      if (feedbackText) {
        setLatestFeedback(feedbackText);
      }

      addMessage('assistant', spokenText);
      speakText(spokenText, settingsRef.current.voiceName, settingsRef.current.speechRate);
    } catch (err: any) {
      addMessage(
        'system',
        `I couldn't reach the AI service: ${err.message || 'unknown error'}. Check your backend settings or continue with text-based demo practice.`
      );
      setStatus('Connection issue');
    } finally {
      setIsBusy(false);
      const isConfigured = Boolean(settingsRef.current.backendUrl && settingsRef.current.accessCode);
      setStatus(isConfigured ? 'AI configured' : 'Demo mode');
    }
  }, [addMessage]);

  // Initialize Speech Recognition
  useEffect(() => {
    const supported = isSpeechRecognitionSupported();
    setVoiceAvailable(supported);

    if (supported) {
      const recognizer = createSpeechRecognizer({
        onStart: () => {
          setIsListening(true);
          setStatus('Listening');
        },
        onResult: (transcript) => {
          if (transcript) {
            handleAsk(transcript);
          }
        },
        onError: (err) => {
          addMessage('system', `Microphone issue: ${err}. Check browser permission or use text input.`);
        },
        onEnd: () => {
          setIsListening(false);
          const isConfigured = Boolean(settingsRef.current.backendUrl && settingsRef.current.accessCode);
          if (!isBusyRef.current) {
            setStatus(isConfigured ? 'AI configured' : 'Demo mode');
          }
        }
      });
      recognizerRef.current = recognizer;
    }
  }, [addMessage, handleAsk]);

  const handleToggleMic = () => {
    if (!recognizerRef.current || isBusy) return;
    if (isListening) {
      recognizerRef.current.stop();
    } else {
      stopSpeaking();
      try {
        recognizerRef.current.start();
      } catch {
        addMessage('system', 'The microphone is already starting. Wait and try again.');
      }
    }
  };

  const handleStopVoice = () => {
    stopSpeaking();
  };

  const handleClearChat = () => {
    stopSpeaking();
    setMessages([
      {
        id: `init-${Date.now()}`,
        role: 'assistant',
        text: "Conversation cleared. Choose a mode and tell me what you'd like to practise."
      }
    ]);
    setLatestFeedback(undefined);
  };

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('voxmate_backend_url', newSettings.backendUrl);
    localStorage.setItem('voxmate_access_code', newSettings.accessCode);
    localStorage.setItem('voxmate_rate', String(newSettings.speechRate));
    localStorage.setItem('voxmate_voice', newSettings.voiceName);

    const isConfigured = Boolean(newSettings.backendUrl && newSettings.accessCode);
    setStatus(isConfigured ? 'AI configured' : 'Demo mode');
    addMessage(
      'system',
      isConfigured
        ? 'Backend settings saved for this browser session.'
        : 'Demo mode active. No API key is stored in the website.'
    );
  };

  return (
    <main className="app">
      <Topbar
        status={status}
        healthStatus={healthStatus}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <WelcomeCard
        mode={mode}
        onModeChange={(newMode) => setMode(newMode)}
      />

      <TaskDesk onSelectPrompt={handleAsk} />

      <ChatSection
        messages={messages}
        latestFeedback={latestFeedback}
        isListening={isListening}
        isBusy={isBusy}
        voiceAvailable={voiceAvailable}
        onSendMessage={handleAsk}
        onToggleMic={handleToggleMic}
        onStopVoice={handleStopVoice}
        onClearChat={handleClearChat}
      />

      <QuickActions onSelectPrompt={handleAsk} />

      <footer className="footer">
        VoxMate is an evolving personal project. Review important outputs before sending or publishing.
      </footer>

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
        onHealthCheckAlert={(msg) => addMessage('system', msg)}
      />
    </main>
  );
};

export default App;
