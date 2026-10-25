import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';

interface ChatSectionProps {
  messages: ChatMessage[];
  latestFeedback?: string;
  isListening: boolean;
  isBusy: boolean;
  voiceAvailable: boolean;
  onSendMessage: (text: string) => void;
  onToggleMic: () => void;
  onStopVoice: () => void;
  onClearChat: () => void;
}

export const ChatSection: React.FC<ChatSectionProps> = ({
  messages,
  latestFeedback,
  isListening,
  isBusy,
  voiceAvailable,
  onSendMessage,
  onToggleMic,
  onStopVoice,
  onClearChat
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isBusy) return;
    setInputText('');
    onSendMessage(trimmed);
  };

  return (
    <section className="chat card" aria-label="Conversation">
      <div className="chat-head">
        <h2>Conversation</h2>
        <button 
          className="text-button" 
          id="clear-chat" 
          onClick={onClearChat} 
          type="button"
        >
          Clear
        </button>
      </div>

      <div id="messages" className="messages" aria-live="polite">
        {messages.map((msg) => (
          <div key={msg.id} className={`bubble ${msg.role}`}>
            {msg.text}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {latestFeedback && (
        <section id="feedback" className="feedback">
          <strong>Coach notes</strong>
          <div id="feedback-text">{latestFeedback}</div>
        </section>
      )}

      <form id="text-form" className="composer" onSubmit={handleSubmit}>
        <input
          id="text-input"
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type if you prefer…"
          autoComplete="off"
          aria-label="Message"
          disabled={isBusy}
        />
        <button type="submit" className="send" disabled={isBusy || !inputText.trim()}>
          Send
        </button>
      </form>

      <div className="voice-controls">
        <button
          id="mic"
          className={`mic ${isListening ? 'listening' : ''}`}
          onClick={onToggleMic}
          disabled={isBusy || !voiceAvailable}
          aria-label={isListening ? 'Stop listening' : 'Start speaking'}
          type="button"
        >
          <span>🎙</span>
          <span id="mic-label">
            {!voiceAvailable
              ? 'Voice unavailable'
              : isListening
              ? 'Listening… tap to stop'
              : 'Tap to speak'}
          </span>
        </button>
        <button
          id="stop-speaking"
          className="secondary-button"
          onClick={onStopVoice}
          type="button"
        >
          Stop voice
        </button>
      </div>

      <p className="tiny muted center" id="voice-note">
        {!voiceAvailable
          ? "Speech recognition isn't supported here. Use the text box or try Chrome on Android/desktop."
          : 'Voice support varies by browser. Text chat is always available.'}
      </p>
    </section>
  );
};
