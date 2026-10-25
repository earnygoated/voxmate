# VoxMate — Voice Coach & Personal Assistant (React)

VoxMate is a modern React application rewritten from the original prototype. It provides a voice-first communication coach and personal assistant designed to help users practice professional English, prepare for job interviews, role-play international client conversations, and draft everyday work content.

## Features

- **Voice & Speech Recognition**: Web Speech API integration (`SpeechRecognition`) for spoken responses and prompt execution with live listening indicators.
- **Text-to-Speech (TTS)**: Built-in synthesis with customizable voice and speech rate settings (0.75× to 1.15×).
- **Multiple Assistant Modes**:
  - **English Coach**: Focuses on speaking first and constructive feedback second (70/30 practice-to-feedback ratio).
  - **Personal Assistant**: Plans, brainstorms, organizes, and drafts communications.
  - **Job Interview Practice**: Simulates real-world administrative and customer support interview scenarios.
  - **Client Role-Play**: Simulates international client calls and provides clarity feedback.
- **Assistant Desk**: Ready-to-go interactive task cards for daily English speaking, job preparation, email drafts, LinkedIn posts, day planning, and follow-up checklists.
- **Live Coaching Feedback Notes**: Automatic parsing and display of structured `<feedback>` tags in an dedicated coach panel.
- **Flexible Backend & Demo Mode**:
  - Out-of-the-box offline **Demo mode** with built-in realistic mock coaching responses.
  - Configurable backend URL and private access code settings stored securely in `localStorage`.
  - Automatic backend health checking and status badge.

## Tech Stack

- **Framework**: React 19 + TypeScript
- **Bundler & Dev Server**: Vite (listening on port 3000)
- **Styling**: Tailored responsive CSS matching VoxMate's dark mode visual identity

## Development

```bash
# Install dependencies
npm install

# Start development server on port 3000
npm run dev

# Build for production
npm run build
```
