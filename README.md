# 🧠 MindSpace

A voice-to-notes visual thinking application built with Expo and Supabase. 
Turn your chaotic voice thoughts into beautifully organized, interactive sticky notes on an infinite canvas.

## Features

- 🎙️ **Voice-to-Notes**: Just hit record and speak. MindSpace automatically transcribes your voice and extracts ideas, tasks, questions, and decisions.
- 🎨 **Claymorphism Aesthetic**: Excalidraw-inspired tactile sticky notes with hand-drawn fonts, realistic folded corners, and soft lighting.
- 🗺️ **Infinite Canvas**: Zoom, pan, and drag your sticky notes around freely to visually organize your thoughts.
- 🔐 **Supabase Backend**: Built entirely on Supabase for Auth, Storage, Edge Functions, and Realtime Database.
- ⚡ **Cross-Platform**: Built using React Native and Expo, providing a seamless mobile experience.

## Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Supabase Setup**
   MindSpace requires a Supabase project with the appropriate schema and Edge Functions.
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   npx supabase functions deploy transcribe
   ```

3. **Start the App**
   ```bash
   npx expo start
   ```

## Tech Stack
- **Frontend**: React Native, Expo, Tailwind CSS (NativeWind), Reanimated, React Native Gesture Handler.
- **Backend**: Supabase (PostgreSQL, Storage, Edge Functions, Auth).
- **Design Language**: Claymorphism, soft gradients, and hand-drawn accents.
