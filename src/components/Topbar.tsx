import React from 'react';

interface TopbarProps {
  status: string;
  healthStatus: string;
  onOpenSettings: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ status, healthStatus, onOpenSettings }) => {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">YOUR VOICE-FIRST AI COMPANION</p>
        <h1>
          VoxMate
          <span className="status" id="status">{status}</span>
          <span className="status" id="health-result">{healthStatus}</span>
        </h1>
      </div>
      <button 
        className="icon-button" 
        onClick={onOpenSettings} 
        aria-label="Open settings"
        type="button"
      >
        ⚙
      </button>
    </header>
  );
};
