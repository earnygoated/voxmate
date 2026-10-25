import React from 'react';
import { Mode } from '../types';

interface WelcomeCardProps {
  mode: Mode;
  onModeChange: (newMode: Mode) => void;
}

export const WelcomeCard: React.FC<WelcomeCardProps> = ({ mode, onModeChange }) => {
  return (
    <section className="welcome card">
      <p className="eyebrow">YOUR PERSONAL WORK & GROWTH COMPANION</p>
      <h2>Good morning. Let's move your goals forward.</h2>
      <p className="muted">
        Built around your priorities: speak confidently with international clients, find better work opportunities, and stay organised. Talk to VoxMate or choose a task below.
      </p>

      <div className="goal-strip">
        <div>
          <span className="goal-icon">🎙️</span>
          <strong>Speak with confidence</strong>
          <small>Daily professional English</small>
        </div>
        <div>
          <span className="goal-icon">🌍</span>
          <strong>Grow your career</strong>
          <small>Remote & international roles</small>
        </div>
        <div>
          <span className="goal-icon">✅</span>
          <strong>Get things done</strong>
          <small>Tasks, drafts & follow-ups</small>
        </div>
      </div>

      <label className="field-label" htmlFor="mode">
        How can I help right now?
      </label>
      <select 
        id="mode" 
        value={mode} 
        onChange={(e) => onModeChange(e.target.value as Mode)}
      >
        <option value="coach">English coach · speak first, feedback second</option>
        <option value="assistant">Personal assistant · plan, organise and draft</option>
        <option value="interview">Job interview practice · admin/customer support</option>
        <option value="client">International client role-play</option>
      </select>
    </section>
  );
};
