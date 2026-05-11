import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import SpotifyWebApi from 'spotify-web-api-node';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: 'pulse-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: true, 
    sameSite: 'none',
    httpOnly: true 
  }
}));

// Helper to get base URL for redirect URI
const getBaseUrl = (req: express.Request) => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const protocol = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('host');
  return `${protocol}://${host}`;
};

const getSpotifyApi = (req?: express.Request) => {
  const redirectUri = req ? `${getBaseUrl(req)}/auth/callback` : undefined;
  return new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: redirectUri || `${process.env.APP_URL || 'http://localhost:3000'}/auth/callback`
  });
};

const checkSpotifyConfig = () => {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    console.error('CRITICAL: SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET is missing in environment variables.');
    return false;
  }
  return true;
};

// Spotify Auth Endpoints
app.get('/api/auth/url', (req, res) => {
  if (!checkSpotifyConfig()) {
    return res.status(500).json({ error: 'Spotify API credentials are not configured. Please add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to the Secrets panel.' });
  }
  const scopes = ['user-read-private', 'user-read-email', 'playlist-read-private', 'streaming', 'user-modify-playback-state', 'user-read-playback-state'];
  const api = getSpotifyApi(req);
  const authorizeURL = api.createAuthorizeURL(scopes, 'pulse-state');
  res.json({ url: authorizeURL });
});

app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const { code } = req.query;
  const api = getSpotifyApi(req);
  try {
    const data = await api.authorizationCodeGrant(code as string);
    const accessToken = data.body['access_token'];
    const refreshToken = data.body['refresh_token'];

    // In a real app we'd save this to a session or DB
    // For this demo, we'll send it back to the client via postMessage
    res.send(`
      <html>
        <head>
          <style>
            body { font-family: sans-serif; background: #121212; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .container { max-width: 400px; padding: 2rem; background: #181818; border-radius: 12px; border: 1px solid #282828; }
            h1 { color: #1DB954; font-size: 1.5rem; margin-bottom: 1rem; }
            p { color: #b3b3b3; line-height: 1.6; }
            .hint { font-size: 0.8rem; background: #282828; padding: 1rem; border-radius: 8px; margin-top: 1rem; text-align: left; }
          </style>
        </head>
        <body>
          <div class="container">
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS', 
                  tokens: { 
                    accessToken: '${accessToken}',
                    refreshToken: '${refreshToken}'
                  } 
                }, '*');
                setTimeout(() => window.close(), 1000);
              } else {
                window.location.href = '/';
              }
            </script>
            <h1>Connected!</h1>
            <p>Authentication successful. Your mood-aware experience is starting.</p>
            <p style="font-size: 0.8rem; color: #666;">This window will close automatically.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error('Error in callback:', error);
    const is403 = error.statusCode === 403;
    res.status(error.statusCode || 500).send(`
      <html>
        <head>
          <style>
            body { font-family: sans-serif; background: #121212; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .container { max-width: 450px; padding: 2rem; background: #181818; border-radius: 12px; border: 1px solid #282828; }
            h1 { color: #ff5f5f; font-size: 1.5rem; margin-bottom: 1rem; }
            p { color: #b3b3b3; line-height: 1.6; }
            .hint { font-size: 0.8rem; background: #282828; padding: 1rem; border-radius: 8px; margin-top: 1rem; text-align: left; color: #1DB954; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>${is403 ? 'Spotify Access Denied' : 'Auth Failed'}</h1>
            <p>${is403 ? 'Your account is not whitelisted in the developer dashboard for this app.' : 'Something went wrong during Spotify authentication.'}</p>
            ${is403 ? `
              <div class="hint">
                <strong>Fix:</strong> The app owner must add your email to the "User Management" section of their <a href="https://developer.spotify.com/dashboard" style="color: #1DB954;">Spotify Developer Dashboard</a> because the app is in Development Mode.
              </div>
            ` : ''}
            <button onclick="window.close()" style="margin-top: 1.5rem; background: #1DB954; color: black; border: none; padding: 0.8rem 1.5rem; border-radius: full; font-weight: bold; cursor: pointer;">Close Window</button>
          </div>
        </body>
      </html>
    `);
  }
});

app.get('/api/auth/refresh', async (req, res) => {
  const { refreshToken } = req.query;
  if (!refreshToken) return res.status(400).json({ error: 'No refresh token provided' });

  if (!checkSpotifyConfig()) {
    return res.status(500).json({ error: 'Spotify API credentials are not configured.' });
  }

  const api = new SpotifyWebApi({ 
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    refreshToken: refreshToken as string
  });

  try {
    const data = await api.refreshAccessToken();
    const accessToken = data.body['access_token'];
    res.json({ accessToken });
  } catch (error: any) {
    console.error(`[Spotify Refresh Error] ${error.message}`);
    res.status(401).json({ error: 'Could not refresh token' });
  }
});

// Spotify Playback Control
app.put('/api/spotify/play', async (req, res) => {
  const { uri } = req.body;
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  if (!uri) return res.status(400).json({ error: 'No URI provided' });

  const api = new SpotifyWebApi({ 
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET
  });
  api.setAccessToken(token);

  try {
    // Attempt to start playback
    await api.play({ uris: [uri] });
    res.json({ success: true });
  } catch (error: any) {
    console.error(`[Spotify Play Error] ${error.message}`);
    // If no active device, return specific error
    if (error.statusCode === 404) {
      return res.status(404).json({ error: 'No active Spotify device found. Please open Spotify on your device.' });
    }
    res.status(error.statusCode || 500).json({ error: error.message });
  }
});

// Simple in-memory cache for search results
const searchCache = new Map<string, { tracks: any[], timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // Increased to 15 minutes

// Music Recommendation Proxy
app.get('/api/recommendations', async (req, res) => {
  const { mood, excludeIds } = req.query;
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token || token === 'null' || token === 'undefined') return res.status(401).json({ error: 'No valid token provided' });
  if (!mood) return res.status(400).json({ error: 'No mood provided' });

  // Check Cache First
  const cacheKey = `mood_${mood}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Spotify Cache] Serving results for mood: ${mood}`);
    let tracks = [...cached.tracks];
    const exclusionList = typeof excludeIds === 'string' ? excludeIds.split(',') : [];
    if (exclusionList.length > 0) {
      tracks = tracks.filter(t => !exclusionList.includes(t.id));
    }
    return res.json({ tracks: tracks.slice(0, 20) });
  }

  const exclusionList = typeof excludeIds === 'string' ? excludeIds.split(',') : [];

  if (!checkSpotifyConfig()) {
    return res.status(500).json({ error: 'Spotify API credentials are not configured.' });
  }

  const api = new SpotifyWebApi({ 
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET
  });
  api.setAccessToken(token);

  const moodQueryMap: Record<string, string> = {
    happy: 'top happy pop hits 2024',
    sad: 'sad acoustic indie piano',
    angry: 'heavy rock nu-metal',
    neutral: 'low-fi study focus beats',
    surprised: 'upbeat dance electronics',
    fearful: 'dark ambient cinematic suspense',
    disgusted: 'liquid jazz soul chill'
  };

  try {
    const query = moodQueryMap[mood as string] || 'trending';
    console.log(`[Spotify] Searching mood: ${mood} | Query: ${query} | Exclude: ${exclusionList.length}`);
    
    // 2. Search for tracks.
    try {
      // Request a bit more so we can shuffle and filter
      let tracks: any[] = [];
      const data = await api.searchTracks(query, { limit: 50 });
      tracks = data.body.tracks?.items || [];

      // 1. Fallback if specific mood query fails: Try genre search
      if (tracks.length === 0) {
        console.log(`[Spotify] Primary query failed, trying genre fallback for: ${mood}`);
        const genreQueryMap: Record<string, string> = {
          happy: 'genre:pop',
          sad: 'genre:acoustic',
          angry: 'genre:rock',
          neutral: 'genre:study',
          surprised: 'genre:dance',
          fearful: 'genre:ambient',
          disgusted: 'genre:jazz'
        };
        const genreQuery = genreQueryMap[mood as string] || 'genre:pop';
        const genreData = await api.searchTracks(genreQuery, { limit: 50 });
        tracks = genreData.body.tracks?.items || [];
      }

      // Store in cache before filtering exclusions
      if (tracks.length > 0) {
        searchCache.set(cacheKey, { tracks: [...tracks], timestamp: Date.now() });
      }

      // 2. Filter out recently played
      let filteredTracks = tracks;
      if (exclusionList.length > 0) {
        filteredTracks = tracks.filter(t => !exclusionList.includes(t.id));
        // If exclusion is too aggressive, keep some tracks anyway to avoid empty state
        if (filteredTracks.length < 5 && tracks.length > 0) {
          console.log('[Spotify] Exclusion too aggressive, relaxing filter');
          filteredTracks = tracks; 
        }
      }
      
      tracks = filteredTracks;

      // 3. Final fallback: If STILL nothing, just search for global hits
      if (tracks.length === 0) {
        console.log('[Spotify] Everything failed, searching for global top hits');
        const fallbackData = await api.searchTracks('top hits 2024', { limit: 20 });
        tracks = fallbackData.body.tracks?.items || [];
      }
      
      // Randomize the results for rotation
      for (let i = tracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
      }
      
      // Sort tracks so those with previews are still preferred, but randomized within groups
      tracks.sort((a, b) => {
        if (a.preview_url && !b.preview_url) return -1;
        if (!a.preview_url && b.preview_url) return 1;
        return 0;
      });

      const withPreview = tracks.filter(t => !!t.preview_url).length;
      console.log(`[Spotify] Found ${tracks.length} tracks after fallbacks (${withPreview} have previews).`);
      
      return res.json({ tracks: tracks.slice(0, 20) });
    } catch (searchError: any) {
      if (searchError.statusCode === 429) {
        return res.status(429).json({ error: 'Spotify rate limit reached. Please wait a moment.' });
      }
      const errorBody = searchError.body ? JSON.stringify(searchError.body) : 'No body';
      console.error(`[Spotify Search Error] Status: ${searchError.statusCode} | Msg: ${searchError.message} | Body: ${errorBody}`);
      return res.json({ tracks: [] });
    }
  } catch (error: any) {
    console.error(`[Spotify Unexpected] ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  console.log(`Starting server in ${process.env.NODE_ENV} mode...`);

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    console.log(`Serving static files from: ${distPath}`);
    
    // Serve static files
    app.use(express.static(distPath));
    
    // SPA Fallback: ALL routes not handled by API or static files go to index.html
    app.get('*', (req, res) => {
      // Avoid infinite loop if index.html is missing
      res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err) {
          console.error('Error sending index.html:', err);
          res.status(404).send('Application not built. Please run npm run build.');
        }
      });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Base URL: ${process.env.APP_URL || `http://localhost:${PORT}`}`);
  });
}

startServer();
