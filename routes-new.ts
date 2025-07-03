import type { Express } from "express";
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
      
      // Get Spotify recommendations
      const spotifyRecommendations = await spotifyService.getRecommendations(
        validatedData.valence, 
        validatedData.energy, 
        moodAnalysis.suggestedGenres
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
        moodEntry: {
          ...moodEntry.toObject(),
          id: moodEntry._id.toString()
        },
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

  // Get all mood entries
  app.get("/api/mood-entries", async (req, res) => {
    try {
      const entries = await MoodEntry.find().sort({ createdAt: -1 });
      const entriesWithId = entries.map(entry => ({
        ...entry.toObject(),
        id: entry._id.toString()
      }));
      res.json(entriesWithId);
    } catch (error) {
      console.error("Failed to get mood entries:", error);
      res.status(500).json({ message: "Failed to retrieve mood entries" });
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
      
      const entriesWithId = moodEntries.map(entry => ({
        ...entry,
        id: entry._id.toString()
      }));
      res.json(entriesWithId);
    } catch (error) {
      console.error("Error fetching recent mood entries:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch mood entries" 
      });
    }
  });

  // Get mood entry by ID
  app.get("/api/mood-entries/:id", async (req, res) => {
    try {
      const entry = await MoodEntry.findById(req.params.id);
      if (!entry) {
        return res.status(404).json({ message: "Mood entry not found" });
      }
      res.json({
        ...entry.toObject(),
        id: entry._id.toString()
      });
    } catch (error) {
      console.error("Failed to get mood entry:", error);
      res.status(500).json({ message: "Failed to retrieve mood entry" });
    }
  });

  // Get recommendations for a mood entry
  app.get("/api/mood-entries/:id/recommendations", async (req, res) => {
    try {
      const recommendations = await SpotifyRecommendation.find({ 
        moodEntryId: req.params.id 
      });
      res.json(recommendations);
    } catch (error) {
      console.error("Failed to get recommendations:", error);
      res.status(500).json({ message: "Failed to retrieve recommendations" });
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

  // Create saved playlist
  app.post("/api/playlists", async (req, res) => {
    try {
      const validatedData = insertSavedPlaylistSchema.parse(req.body);
      const playlist = await SavedPlaylist.create(validatedData);
      res.json({
        ...playlist.toObject(),
        id: playlist._id.toString()
      });
    } catch (error) {
      console.error("Failed to create playlist:", error);
      res.status(500).json({ message: "Failed to create playlist" });
    }
  });

  // Get all saved playlists
  app.get("/api/playlists", async (req, res) => {
    try {
      const playlists = await SavedPlaylist.find().sort({ createdAt: -1 });
      const playlistsWithId = playlists.map(playlist => ({
        ...playlist.toObject(),
        id: playlist._id.toString()
      }));
      res.json(playlistsWithId);
    } catch (error) {
      console.error("Failed to get playlists:", error);
      res.status(500).json({ message: "Failed to retrieve playlists" });
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
