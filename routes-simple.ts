import type { Express } from "      // Get Spotify recommendations based on user's actual mood input
      const spotifyRecommendations = await spotifyService.getRecommendations(
        validatedData.energy,   // Use user's actual energy (1-10 scale)
        validatedData.valence,  // Use user's actual valence (1-10 scale)
        moodAnalysis.suggestedGenres || []
      );s";
import { createServer, type Server } from "http";
import mongoose from 'mongoose';
import { MoodEntry, AiReflection, SpotifyRecommendation, SavedPlaylist } from "./models";
import { analyzeMood, generateDailyAffirmation } from "./services/openai";
import { spotifyService } from "./services/spotify";
import { insertMoodEntrySchema, insertSavedPlaylistSchema } from "./schema";

export function registerRoutes(app: Express): Promise<Server> {
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
      const spotifyRecommendations = await spotifyService.getRecommendations(
        validatedData.energy,    // Use user's actual energy (1-10 scale)
        validatedData.valence,   // Use user's actual valence (1-10 scale)  
        moodAnalysis.suggestedGenres || []
      );
      
      // Save Spotify recommendations
      const savedRecommendations = await Promise.all(
        spotifyRecommendations.map(track => 
          SpotifyRecommendation.create({
            moodEntryId: moodEntry._id,
            spotifyTrackId: track.id,
            trackName: track.name,
            artistName: track.artists[0]?.name || 'Unknown Artist',
            albumImageUrl: track.album?.images?.[0]?.url,
            previewUrl: track.preview_url,
            energy: validatedData.energy / 10, // Convert from 1-10 to 0-1 scale
            valence: validatedData.valence / 10, // Convert from 1-10 to 0-1 scale
          })
        )
      );
      
      res.json({
        moodEntry,
        aiReflection,
        recommendations: savedRecommendations,
      });
    } catch (error) {
      console.error("Error creating mood entry:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to create mood entry" 
      });
    }
  });

  // Get recent mood entries
  app.get("/api/mood-entries/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const moodEntries = await MoodEntry.find()
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      
      res.json(moodEntries);
    } catch (error) {
      console.error("Error fetching recent mood entries:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch mood entries" 
      });
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

  const httpServer = createServer(app);
  return Promise.resolve(httpServer);
}
