export type Mode = 'coach' | 'assistant' | 'interview' | 'client';

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'user' | 'system';
  text: string;
  feedback?: string;
  timestamp?: number;
}

export interface AppSettings {
  backendUrl: string;
  accessCode: string;
  speechRate: number;
  voiceName: string;
}

export interface TaskCardItem {
  icon: string;
  title: string;
  description: string;
  actionText: string;
  prompt: string;
}
