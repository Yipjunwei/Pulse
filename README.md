# Pulse 🎧

Pulse is an AI-powered emotion-aware music generator that matches your current mood to Spotify playlists using real-time facial detection. It features a cool "AI DJ" persona that speaks to you as your mood shifts.

## ✨ Features

-   **Real-time Emotion Detection**: Uses `face-api.js` to detect your emotions through your webcam.
-   **Mood-to-Music Mapping**: Automatically finds and plays tracks on Spotify that resonate with your current vibe.
-   **AI DJ Persona 🤖**: An intelligent DJ that notices your emotional shifts and provides verbal context via Text-to-Speech (Gemini TTS).
-   **Spotify Integration**: Full OAuth flow to connect your own Spotify account and control playback (requires Premium).
-   **Brutalist/Modern UI**: A dark, high-contrast, polished interface built with Tailwind CSS and Motion.

## 🚀 Setup Instructions

### 1. Spotify Developer Dashboard
To get Pulse working, you need to create an application in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).

1.  Log in and click **Create App**.
2.  Set **Redirect URIs** to your app's URL followed by `/auth/callback`. For example:
    -   `https://ais-dev-...run.app/auth/callback`
3.  Ensure you add whichever email addresses you want to use for testing to the **User Management** section of the dashboard (since your app will be in "Development Mode").

### 2. Environment Variables
Add the following secrets to your environment:

-   `SPOTIFY_CLIENT_ID`: Your Spotify Client ID.
-   `SPOTIFY_CLIENT_SECRET`: Your Spotify Client Secret.
-   `GEMINI_API_KEY`: Your Google Gemini API Key (used for TTS).
-   `APP_URL`: (Optional) The base URL of your deployed app.

## 🛠 Tech Stack

-   **Frontend**: React, Vite, Tailwind CSS, Motion (Framer Motion).
-   **Backend**: Node.js, Express.
-   **AI/ML**: 
    -   `face-api.js` for facial emotion recognition.
    -   Google Gemini API (TTS) for the AI DJ voice.
-   **API**: Spotify Web API.

## 💡 How to Use

1.  **Authorize**: Click the "Connect Spotify" button and log in.
2.  **Calibrate**: Grant camera permissions. The AI needs a clear view of your face.
3.  **Stabilize**: The app uses a **3-second stability rule** to prevent erratic music changes. Maintain an expression for 3 seconds to trigger a new playlist search.
4.  **Cooldown**: There is a 15-second cooldown between Spotify searches to respect rate limits.
5.  **Listen**: Pulse will automatically update the tracks and the AI DJ will announce the shift.

