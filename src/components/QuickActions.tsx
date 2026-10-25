import React from 'react';

interface QuickActionsProps {
  onSelectPrompt: (prompt: string) => void;
}

const QUICK_ITEMS = [
  {
    label: 'Interview warm-up',
    prompt: 'Ask me one interview question for an administrative assistant or customer support job. Wait for my answer and then coach me.'
  },
  {
    label: 'Professional phrases',
    prompt: 'Teach me three natural professional phrases I can use with international clients, then role-play a short conversation with me.'
  },
  {
    label: 'One earning-focused action',
    prompt: 'Help me choose one realistic action I can take today to improve my chances of earning through a job. Ask one question at a time.'
  }
];

export const QuickActions: React.FC<QuickActionsProps> = ({ onSelectPrompt }) => {
  return (
    <section className="quick-actions">
      {QUICK_ITEMS.map((item, index) => (
        <button
          key={index}
          className="quick"
          onClick={() => onSelectPrompt(item.prompt)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </section>
  );
};
