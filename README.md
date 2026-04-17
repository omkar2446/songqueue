# Synco - Real-Time Collaborative Music Queue

Synco is a full-stack web application that lets multiple users join a virtual room and manage a shared music queue with synchronized playback.

## Features
- **Real-Time Sync**: Play, pause, seek, and queue updates are synced across all users instantly with WebSockets.
- **Multi-Source**: Supports YouTube videos and local audio uploads.
- **Admin Controls**: Room owners control playback and settings.
- **User Entry**: Secure form with name and email validation.
- **Playlist Replay**: Toggle repeat mode to keep the party going.
- **Modern UI**: Glassmorphic UI with smooth animations.

## Tech Stack
- **Backend**: Python, Flask, Flask-SocketIO, SQLAlchemy
- **Frontend**: React, Vite, Tailwind CSS, Framer Motion, Lucide Icons
- **Database**: PostgreSQL (Render) / SQLite (local dev)

## Setup Instructions

### 1. Backend Setup
1. Navigate to the `server` directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Create a `.env` file in the `server` folder:
   ```env
   SECRET_KEY=your_random_secret
   YOUTUBE_API_KEY=YOUR_YOUTUBE_DATA_API_V3_KEY
   ```
4. Start the server:
   ```bash
   python app.py
   ```

The backend runs on `http://localhost:5000` locally.

Production backend: `https://songqueue-1.onrender.com`

### 2. Frontend Setup
1. Navigate to the `client` directory:
   ```bash
   cd client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

The frontend runs on `http://localhost:5173`.

## Configuration Details

### YouTube API Key
To search for YouTube videos, you need an API key:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project.
3. Enable the YouTube Data API v3.
4. Create credentials and paste the API key into `server/.env`.

### Data Persistence
- **Production**: PostgreSQL on Render (set `DATABASE_URL` env var).
- **Local development**: Falls back to SQLite at `server/data/songqueue.db`.
