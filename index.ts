import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { connectToDatabase } from "./db";
import mongoose from 'mongoose';
import { MoodEntry, AiReflection, SpotifyRecommendation, SavedPlaylist } from "./models";
import { analyzeMood, generateDailyAffirmation } from "./services/openai";
import { spotifyService } from "./services/spotify";
import { insertMoodEntrySchema, insertSavedPlaylistSchema } from "./schema";

const app = express();

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === "production" 
    ? [
        process.env.CLIENT_URL || "https://mood-tune.vercel.app",
        "https://mood-tune.vercel.app",
        // Allow any vercel.app domain for flexibility
        /\.vercel\.app$/
      ]
    : "http://localhost:5173",
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      console.log(`${new Date().toLocaleTimeString()} [server] ${logLine}`);
    }
  });

  next();
});

(async () => {
  // Connect to MongoDB
  try {
    await connectToDatabase();
  } catch (error) {
    console.error("Failed to connect to database:", error);
    console.warn("⚠️  Continuing without database connection. API routes may fail.");
  }

  // Register API routes directly
  
  // Create mood entry with AI analysis and Spotify recommendations
  app.post("/api/mood-entries", async (req, res) => {
    try {
      const validatedData = insertMoodEntrySchema.parse(req.body);
      
      // Create mood entry
      const moodEntry = await MoodEntry.create(validatedData);
      
      // Analyze mood with AI
      const moodAnalysis = await analyzeMood(
        validatedData.text, 
        validatedData.energy, 
        validatedData.valence
      );
      
      // Create AI reflection
      const aiReflection = await AiReflection.create({
        moodEntryId: moodEntry._id,
        content: moodAnalysis.reflection,
      });
      
      // Get Spotify recommendations based on user's actual mood input
      const spotifyTracks = await spotifyService.getRecommendations(
        validatedData.energy,     // Use user's actual energy (1-10 scale)
        validatedData.valence,    // Use user's actual valence (1-10 scale)
        moodAnalysis.suggestedGenres
      );
      
      // Get audio features for recommendations
      const trackIds = spotifyTracks.map(track => track.id);
      const audioFeatures = await spotifyService.getAudioFeatures(trackIds);
      
      // Store recommendations
      const recommendations = await SpotifyRecommendation.insertMany(
        spotifyTracks.map((track, index) => ({
          moodEntryId: moodEntry._id,
          spotifyTrackId: track.id,
          trackName: track.name,
          artistName: track.artists[0]?.name || "Unknown Artist",
          albumImageUrl: track.album.images[0]?.url || null,
          previewUrl: track.preview_url,
          energy: audioFeatures[index]?.energy || 0.5,
          valence: audioFeatures[index]?.valence || 0.5,
        }))
      );
      
      res.json({
        moodEntry: {
          ...moodEntry.toObject(),
          id: moodEntry._id.toString()
        },
        aiReflection,
        recommendations,
        analysis: moodAnalysis,
      });
    } catch (error) {
      console.error("Failed to create mood entry:", error);
      res.status(500).json({ 
        message: "Failed to create mood entry and generate recommendations",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get recent mood entries
  app.get("/api/mood-entries/recent", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const entries = await MoodEntry.find()
        .sort({ createdAt: -1 })
        .limit(limit);
      
      const entriesWithId = entries.map(entry => ({
        ...entry.toObject(),
        id: entry._id.toString()
      }));
      res.json(entriesWithId);
    } catch (error) {
      console.error("Failed to get recent mood entries:", error);
      res.status(500).json({ message: "Failed to retrieve recent mood entries" });
    }
  });

  // Get daily affirmation
  app.get("/api/affirmation", async (req, res) => {
    try {
      // Get recent mood entries for context
      const recentMoods = await MoodEntry.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('text valence energy')
        .lean();
      
      const moodTexts = recentMoods.map(mood => mood.text);
      const affirmation = await generateDailyAffirmation(moodTexts);
      
      res.json({ affirmation });
    } catch (error) {
      console.error("Error generating affirmation:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to generate affirmation" 
      });
    }
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "OK", 
      timestamp: new Date().toISOString(),
      database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
    });
  });

  // Error handling middleware
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    console.error("Error:", err);
  });

  // Start the server
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`📡 API available at http://localhost:${port}/api`);
  });
})();
