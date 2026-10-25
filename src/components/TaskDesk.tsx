import React from 'react';
import { TaskCardItem } from '../types';

interface TaskDeskProps {
  onSelectPrompt: (prompt: string) => void;
}

const TASK_CARDS: TaskCardItem[] = [
  {
    icon: '🎧',
    title: 'Practice English',
    description: 'Daily speaking, grammar and natural phrasing',
    actionText: 'Start practice →',
    prompt: 'Start a 10-minute spoken professional English session tailored to customer support, administration, operations, and international clients. Ask one question at a time. Let me speak first, then give concise corrections and a natural American-style professional alternative.'
  },
  {
    icon: '🌍',
    title: 'Find & prepare for jobs',
    description: 'Remote work, relocation, CV and interview help',
    actionText: 'Plan my job search →',
    prompt: 'Act as my practical international job-search assistant. Help me find legitimate remote jobs open to applicants based in India and suitable relocation opportunities. Prioritise administrative assistant, virtual assistant, customer support and operations support roles. Ask for a job link or details if needed. Never invent live vacancies or claim you applied.'
  },
  {
    icon: '✉️',
    title: 'Email helper',
    description: 'Summaries and replies for approval',
    actionText: 'Draft an email →',
    prompt: 'Help me draft a professional email reply. Ask me to paste the email with private information removed, then summarise it, suggest a reply, and wait for my approval. Gmail is not connected yet, so do not claim to read or send email directly.'
  },
  {
    icon: '💼',
    title: 'LinkedIn content',
    description: 'Posts, networking messages and project updates',
    actionText: 'Create a draft →',
    prompt: 'Help me write a credible LinkedIn post showing my progress building VoxMate, a mobile-first AI voice assistant and professional English coach. Be honest about what is implemented versus not yet connected. Ask what I tested before making claims. Do not publish it automatically.'
  },
  {
    icon: '🗓️',
    title: 'Plan my day',
    description: 'Small, realistic next steps',
    actionText: "Build today's plan →",
    prompt: 'Help me plan today around three priorities: professional English speaking practice, job-search progress, and one practical task that can improve my earning prospects. Ask what time I have today, then create a realistic plan.'
  },
  {
    icon: '🔔',
    title: 'Follow-ups & reminders',
    description: 'Organise dates and next actions',
    actionText: 'Make a checklist →',
    prompt: 'Help me create a follow-up checklist for my job applications and recruiter messages. Ask me to provide role/company, date applied, and next action. Do not claim to access my inbox or calendar; those integrations are not connected yet.'
  }
];

export const TaskDesk: React.FC<TaskDeskProps> = ({ onSelectPrompt }) => {
  return (
    <section className="workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR ASSISTANT DESK</p>
          <h2>What do you want to do?</h2>
        </div>
        <span className="small-pill">One place · voice or text</span>
      </div>

      <div className="task-grid">
        {TASK_CARDS.map((task, index) => (
          <button
            key={index}
            className="task-card"
            onClick={() => onSelectPrompt(task.prompt)}
            type="button"
          >
            <span className="task-icon">{task.icon}</span>
            <strong>{task.title}</strong>
            <small>{task.description}</small>
            <span className="task-link">{task.actionText}</span>
          </button>
        ))}
      </div>

      <p className="integration-note">
        <strong>Connection status:</strong> Voice and demo practice are available in this prototype. Gmail access, live job searching, automatic LinkedIn publishing and background phone notifications are not connected yet; we'll add and test them one by one.
      </p>
    </section>
  );
};
