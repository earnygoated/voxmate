import React, { useState, useEffect } from 'react';
import { AppSettings } from '../types';
import { checkBackendHealth } from '../services/chat';
import { getAvailableVoices } from '../services/voice';

interface SettingsModalProps {
  isOpen: boolean;
  settings: AppSettings;
  onClose: () => void;
  onSave: (newSettings: AppSettings) => void;
  onHealthCheckAlert?: (message: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  settings,
  onClose,
  onSave,
  onHealthCheckAlert
}) => {
  const [backendUrl, setBackendUrl] = useState(settings.backendUrl);
  const [accessCode, setAccessCode] = useState(settings.accessCode);
  const [speechRate, setSpeechRate] = useState(settings.speechRate);
  const [voiceName, setVoiceName] = useState(settings.voiceName);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [healthDetail, setHealthDetail] = useState('Checking whether the backend is reachable…');
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setBackendUrl(settings.backendUrl);
      setAccessCode(settings.accessCode);
      setSpeechRate(settings.speechRate);
      setVoiceName(settings.voiceName);

      const loadedVoices = getAvailableVoices();
      setVoices(loadedVoices);

      // Perform a check
      doCheckHealth(false);
    }
  }, [isOpen, settings]);

  const doCheckHealth = async (isManual: boolean) => {
    setIsCheckingHealth(true);
    setHealthDetail('Checking backend status…');
    const result = await checkBackendHealth(backendUrl);
    setIsCheckingHealth(false);
    if (result.ok) {
      setHealthDetail('Backend is reachable. This check does not use your access code or call Gemini, so it cannot confirm AI replies are working.');
      if (isManual && onHealthCheckAlert) {
        onHealthCheckAlert('Backend is reachable. This check does not test Gemini or use your private access code.');
      }
    } else {
      setHealthDetail('Could not reach the health endpoint. The Worker may need the latest deployment, or the network may be offline.');
      if (isManual && onHealthCheckAlert) {
        onHealthCheckAlert('Backend health check failed. Confirm the Worker is deployed with the /health endpoint, then try again.');
      }
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      backendUrl: backendUrl.trim().replace(/\/+$/, ''),
      accessCode: accessCode.trim(),
      speechRate,
      voiceName
    });
    onClose();
  };

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <dialog 
        open 
        id="settings" 
        onClick={(e) => e.stopPropagation()}
        aria-modal="true"
      >
        <form className="settings-form" onSubmit={handleSubmit}>
          <div className="dialog-head">
            <h2>Settings</h2>
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label="Close settings"
            >
              ✕
            </button>
          </div>

          <p className="muted">
            To enable AI replies, enter your private backend URL and access code. Never put your Gemini API key in this website or in GitHub.
          </p>

          <p id="health-detail" className="muted tiny" role="status">
            {healthDetail}
          </p>

          <button
            type="button"
            className="secondary-button"
            id="check-health"
            style={{ width: '100%', marginTop: '8px' }}
            onClick={() => doCheckHealth(true)}
            disabled={isCheckingHealth}
          >
            {isCheckingHealth ? 'Checking…' : 'Check backend status (no access code needed)'}
          </button>

          <label className="field-label" htmlFor="backend-url">
            Backend URL
          </label>
          <input
            id="backend-url"
            type="url"
            value={backendUrl}
            onChange={(e) => setBackendUrl(e.target.value)}
            placeholder="https://your-worker.workers.dev"
          />

          <label className="field-label" htmlFor="access-code">
            Private access code
          </label>
          <input
            id="access-code"
            type="password"
            autoComplete="off"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            placeholder="Provided when configuring the backend"
          />

          <small>
            Backend URL, private access code, voice and speaking speed are saved in this browser on this device. Enter these settings separately on each device. Do not share your access code; anyone with access to this browser may be able to use it.
          </small>

          <label className="field-label" htmlFor="voice-select">
            Spoken voice
          </label>
          <select
            id="voice-select"
            value={voiceName}
            onChange={(e) => setVoiceName(e.target.value)}
          >
            <option value="">System default</option>
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>

          <label className="field-label" htmlFor="speech-rate">
            Speaking speed <span id="rate-label">{speechRate.toFixed(2)}×</span>
          </label>
          <input
            id="speech-rate"
            type="range"
            min="0.75"
            max="1.15"
            step="0.05"
            value={speechRate}
            onChange={(e) => setSpeechRate(Number(e.target.value))}
          />

          <button type="submit" className="primary-button" id="save-settings">
            Save settings
          </button>
        </form>
      </dialog>
    </div>
  );
};
