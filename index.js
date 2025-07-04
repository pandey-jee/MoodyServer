// index.ts
import "dotenv/config";
import express from "express";
import cors from "cors";

// db.ts
import mongoose from "mongoose";
var MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL;
if (!MONGODB_URI) {
  console.warn(
    "\u26A0\uFE0F  MONGODB_URI not set. Database operations will fail. Please check your .env file."
  );
  console.warn("   Copy .env.example to .env and configure your MongoDB connection.");
}
var isConnected = false;
async function connectToDatabase() {
  if (isConnected) {
    return;
  }
  if (!MONGODB_URI) {
    throw new Error("MongoDB connection string not provided. Please set MONGODB_URI in your .env file.");
  }
  try {
    await mongoose.connect(MONGODB_URI);
    isConnected = true;
    console.log("\u2705 Connected to MongoDB");
  } catch (error) {
    console.error("\u274C MongoDB connection error:", error);
    throw error;
  }
}

// index.ts
import mongoose3 from "mongoose";

// models.ts
import mongoose2 from "mongoose";
var moodEntrySchema = new mongoose2.Schema({
  text: {
    type: String,
    required: true
  },
  emoji: {
    type: String,
    required: true
  },
  quickMood: {
    type: String,
    required: true
  },
  energy: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  valence: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});
var aiReflectionSchema = new mongoose2.Schema({
  moodEntryId: {
    type: mongoose2.Schema.Types.ObjectId,
    ref: "MoodEntry",
    required: true
  },
  content: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});
var spotifyRecommendationSchema = new mongoose2.Schema({
  moodEntryId: {
    type: mongoose2.Schema.Types.ObjectId,
    ref: "MoodEntry",
    required: true
  },
  spotifyTrackId: {
    type: String,
    required: true
  },
  trackName: {
    type: String,
    required: true
  },
  artistName: {
    type: String,
    required: true
  },
  albumImageUrl: {
    type: String,
    default: null
  },
  previewUrl: {
    type: String,
    default: null
  },
  energy: {
    type: Number,
    required: true
  },
  valence: {
    type: Number,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});
var savedPlaylistSchema = new mongoose2.Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: null
  },
  moodEntryIds: [{
    type: mongoose2.Schema.Types.ObjectId,
    ref: "MoodEntry"
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});
var MoodEntry = mongoose2.model("MoodEntry", moodEntrySchema);
var AiReflection = mongoose2.model("AiReflection", aiReflectionSchema);
var SpotifyRecommendation = mongoose2.model("SpotifyRecommendation", spotifyRecommendationSchema);
var SavedPlaylist = mongoose2.model("SavedPlaylist", savedPlaylistSchema);

// services/openai.ts
import OpenAI from "openai";
var openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "default_key"
});
async function analyzeMood(moodText, energy, valence) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an empathetic AI counselor. Analyze mood and suggest music genres."
        },
        {
          role: "user",
          content: `Analyze: "${moodText}" Energy: ${energy}/10 Positivity: ${valence}/10. Return JSON with energy, valence, dominantEmotions, suggestedGenres, reflection.`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7
    });
    const content = response.choices[0]?.message?.content;
    if (content) {
      const analysis = JSON.parse(content);
      return {
        energy: analysis.energy || energy,
        valence: analysis.valence || valence,
        dominantEmotions: analysis.dominantEmotions || ["neutral"],
        suggestedGenres: analysis.suggestedGenres || ["pop"],
        reflection: analysis.reflection || "Thank you for sharing your feelings."
      };
    }
  } catch (error) {
    console.error("OpenAI analysis failed:", error);
  }
  const fallbackGenres = valence >= 7 ? ["pop", "dance"] : valence <= 3 ? ["blues", "folk"] : ["pop", "rock"];
  const fallbackEmotions = valence >= 7 ? ["happy", "energetic"] : valence <= 3 ? ["sad", "reflective"] : ["neutral", "contemplative"];
  return {
    energy,
    valence,
    dominantEmotions: fallbackEmotions,
    suggestedGenres: fallbackGenres,
    reflection: "Thank you for sharing your feelings. I'm here to listen and help you explore your emotions through music."
  };
}
async function generateDailyAffirmation(recentMoods) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Generate a short daily affirmation based on mood patterns."
        },
        {
          role: "user",
          content: `Based on moods: ${recentMoods.join(", ")}, create a short affirmation.`
        }
      ],
      temperature: 0.8,
      max_tokens: 100
    });
    return response.choices[0]?.message?.content?.trim() || "Every feeling you experience is valid and brings you closer to understanding yourself.";
  } catch (error) {
    console.error("Affirmation generation failed:", error);
    return "Every feeling you experience is valid and brings you closer to understanding yourself.";
  }
}

// services/spotify.ts
var SpotifyService = class {
  clientId;
  clientSecret;
  accessToken = null;
  tokenExpires = 0;
  constructor() {
    this.clientId = process.env.SPOTIFY_CLIENT_ID || process.env.SPOTIFY_CLIENT_ID_ENV_VAR || "default_client_id";
    this.clientSecret = process.env.SPOTIFY_CLIENT_SECRET || process.env.SPOTIFY_CLIENT_SECRET_ENV_VAR || "default_client_secret";
  }
  async getAccessToken() {
    if (this.accessToken && Date.now() < this.tokenExpires) {
      return this.accessToken;
    }
    try {
      const response = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`
        },
        body: "grant_type=client_credentials"
      });
      if (!response.ok) {
        throw new Error(`Spotify auth failed: ${response.statusText}`);
      }
      const data = await response.json();
      this.accessToken = data.access_token;
      this.tokenExpires = Date.now() + data.expires_in * 1e3 - 6e4;
      return this.accessToken;
    } catch (error) {
      console.error("Spotify authentication failed:", error);
      throw new Error("Unable to authenticate with Spotify");
    }
  }
  async spotifyRequest(endpoint) {
    const token = await this.getAccessToken();
    const url = `https://api.spotify.com/v1${endpoint}`;
    console.log(`Making Spotify request to: ${url}`);
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
        "Content-Type": "application/json"
      }
    });
    console.log(`Spotify response status: ${response.status} ${response.statusText}`);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Spotify API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Spotify API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }
    const data = await response.json();
    console.log(`Spotify response data:`, JSON.stringify(data, null, 2));
    return data;
  }
  async getRecommendations(energy, valence, genres = []) {
    try {
      const recommendationTracks = await this.tryOfficialRecommendations(energy, valence, genres);
      if (recommendationTracks.length > 0) {
        return recommendationTracks;
      }
      console.log("Official recommendations API not available, using search fallback");
      return await this.getSearchBasedRecommendations(energy, valence, genres);
    } catch (error) {
      console.error("Failed to get any recommendations:", error);
      return [];
    }
  }
  async tryOfficialRecommendations(energy, valence, genres = []) {
    try {
      const spotifyEnergy = Math.max(0, Math.min(1, energy / 10));
      const spotifyValence = Math.max(0, Math.min(1, valence / 10));
      const validSpotifyGenres = [
        "acoustic",
        "blues",
        "classical",
        "country",
        "dance",
        "electronic",
        "folk",
        "hip-hop",
        "indie",
        "jazz",
        "latin",
        "pop",
        "punk",
        "reggae",
        "rock",
        "soul",
        "world-music"
      ];
      let seedGenres = [];
      if (genres.length > 0) {
        seedGenres = genres.map((g) => g.toLowerCase().replace(/[^a-z-]/g, "")).filter((g) => validSpotifyGenres.includes(g)).slice(0, 2);
      }
      if (seedGenres.length === 0) {
        if (spotifyValence >= 0.7 && spotifyEnergy >= 0.7) {
          seedGenres = ["pop", "dance"];
        } else if (spotifyValence <= 0.3) {
          seedGenres = ["blues", "folk"];
        } else if (spotifyEnergy <= 0.3) {
          seedGenres = ["acoustic", "classical"];
        } else {
          seedGenres = ["pop", "rock"];
        }
      }
      if (seedGenres.length === 0) {
        seedGenres = ["pop"];
      }
      const params = new URLSearchParams({
        seed_genres: seedGenres.join(","),
        target_energy: spotifyEnergy.toString(),
        target_valence: spotifyValence.toString(),
        limit: "10",
        market: "US"
      });
      console.log("Trying official recommendations API...");
      const data = await this.spotifyRequest(`/recommendations?${params}`);
      return data.tracks || [];
    } catch (error) {
      console.log("Official recommendations API failed, will try search fallback");
      return [];
    }
  }
  async getSearchBasedRecommendations(energy, valence, genres = []) {
    try {
      const searchTerms = [];
      if (valence >= 7 && energy >= 7) {
        searchTerms.push("happy upbeat", "dance party", "energetic");
      } else if (valence >= 7) {
        searchTerms.push("happy", "feel good", "positive");
      } else if (valence <= 3 && energy <= 3) {
        searchTerms.push("sad slow", "melancholy", "emotional");
      } else if (valence <= 3) {
        searchTerms.push("sad", "blues", "heartbreak");
      } else if (energy >= 7) {
        searchTerms.push("energetic", "workout", "pump up");
      } else if (energy <= 3) {
        searchTerms.push("calm", "relaxing", "chill");
      } else {
        searchTerms.push("popular", "hits", "good vibes");
      }
      if (genres.length > 0) {
        genres.forEach((genre) => {
          if (genre) searchTerms.push(genre.toLowerCase());
        });
      }
      const allTracks = [];
      const maxTracksPerSearch = Math.ceil(10 / searchTerms.length);
      for (const term of searchTerms.slice(0, 3)) {
        try {
          const tracks = await this.searchTracks(term, maxTracksPerSearch);
          allTracks.push(...tracks);
          if (allTracks.length >= 10) break;
        } catch (error) {
          console.error(`Search failed for term "${term}":`, error);
        }
      }
      const uniqueTracks = allTracks.filter(
        (track, index, arr) => arr.findIndex((t) => t.id === track.id) === index
      );
      return uniqueTracks.slice(0, 10);
    } catch (error) {
      console.error("Search-based recommendations failed:", error);
      return [];
    }
  }
  async getAudioFeatures(trackIds) {
    try {
      if (trackIds.length === 0) return [];
      const params = new URLSearchParams({
        ids: trackIds.join(",")
      });
      const data = await this.spotifyRequest(`/audio-features?${params}`);
      return data.audio_features || [];
    } catch (error) {
      console.error("Failed to get audio features:", error);
      return [];
    }
  }
  async searchTracks(query, limit = 10) {
    try {
      const params = new URLSearchParams({
        q: query,
        type: "track",
        limit: limit.toString(),
        market: "US"
      });
      const data = await this.spotifyRequest(`/search?${params}`);
      return data.tracks?.items || [];
    } catch (error) {
      console.error("Failed to search tracks:", error);
      return [];
    }
  }
  async getAvailableGenres() {
    try {
      const data = await this.spotifyRequest("/recommendations/available-genre-seeds");
      return data.genres || [];
    } catch (error) {
      console.error("Failed to get available genres, using fallback list:", error);
      return [
        "acoustic",
        "afrobeat",
        "alt-rock",
        "alternative",
        "ambient",
        "blues",
        "bossanova",
        "brazil",
        "breakbeat",
        "british",
        "chill",
        "classical",
        "country",
        "dance",
        "electronic",
        "folk",
        "funk",
        "hip-hop",
        "house",
        "indie",
        "jazz",
        "latin",
        "pop",
        "punk",
        "r-n-b",
        "reggae",
        "rock",
        "soul",
        "world-music"
      ];
    }
  }
};
var spotifyService = new SpotifyService();

// schema.ts
import { z } from "zod";
var insertMoodEntrySchema = z.object({
  text: z.string().min(1, "Mood text is required"),
  emoji: z.string().min(1, "Emoji is required"),
  quickMood: z.string().min(1, "Quick mood is required"),
  energy: z.number().min(1, "Energy must be at least 1").max(10, "Energy must be at most 10"),
  valence: z.number().min(1, "Valence must be at least 1").max(10, "Valence must be at most 10")
});
var insertSavedPlaylistSchema = z.object({
  name: z.string().min(1, "Playlist name is required"),
  description: z.string().optional(),
  moodEntryIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid mood entry ID"))
});

// index.ts
var app = express();
app.use(cors({
  origin: process.env.NODE_ENV === "production" ? [
    process.env.CLIENT_URL || "https://mood-tune.vercel.app",
    "https://mood-tune.vercel.app",
    // Allow any vercel.app domain for flexibility
    /\.vercel\.app$/
  ] : "http://localhost:5173",
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
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
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      console.log(`${(/* @__PURE__ */ new Date()).toLocaleTimeString()} [server] ${logLine}`);
    }
  });
  next();
});
(async () => {
  try {
    await connectToDatabase();
  } catch (error) {
    console.error("Failed to connect to database:", error);
    console.warn("\u26A0\uFE0F  Continuing without database connection. API routes may fail.");
  }
  app.post("/api/mood-entries", async (req, res) => {
    try {
      const validatedData = insertMoodEntrySchema.parse(req.body);
      const moodEntry = await MoodEntry.create(validatedData);
      const moodAnalysis = await analyzeMood(
        validatedData.text,
        validatedData.energy,
        validatedData.valence
      );
      const aiReflection = await AiReflection.create({
        moodEntryId: moodEntry._id,
        content: moodAnalysis.reflection
      });
      const spotifyTracks = await spotifyService.getRecommendations(
        validatedData.energy,
        // Use user's actual energy (1-10 scale)
        validatedData.valence,
        // Use user's actual valence (1-10 scale)
        moodAnalysis.suggestedGenres
      );
      const trackIds = spotifyTracks.map((track) => track.id);
      const audioFeatures = await spotifyService.getAudioFeatures(trackIds);
      const recommendations = await SpotifyRecommendation.insertMany(
        spotifyTracks.map((track, index) => ({
          moodEntryId: moodEntry._id,
          spotifyTrackId: track.id,
          trackName: track.name,
          artistName: track.artists[0]?.name || "Unknown Artist",
          albumImageUrl: track.album.images[0]?.url || null,
          previewUrl: track.preview_url,
          energy: audioFeatures[index]?.energy || 0.5,
          valence: audioFeatures[index]?.valence || 0.5
        }))
      );
      res.json({
        moodEntry: {
          ...moodEntry.toObject(),
          id: moodEntry._id.toString()
        },
        aiReflection,
        recommendations,
        analysis: moodAnalysis
      });
    } catch (error) {
      console.error("Failed to create mood entry:", error);
      res.status(500).json({
        message: "Failed to create mood entry and generate recommendations",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  app.get("/api/mood-entries/recent", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : 10;
      const entries = await MoodEntry.find().sort({ createdAt: -1 }).limit(limit);
      const entriesWithId = entries.map((entry) => ({
        ...entry.toObject(),
        id: entry._id.toString()
      }));
      res.json(entriesWithId);
    } catch (error) {
      console.error("Failed to get recent mood entries:", error);
      res.status(500).json({ message: "Failed to retrieve recent mood entries" });
    }
  });
  app.get("/api/affirmation", async (req, res) => {
    try {
      const recentMoods = await MoodEntry.find().sort({ createdAt: -1 }).limit(5).select("text valence energy").lean();
      const moodTexts = recentMoods.map((mood) => mood.text);
      const affirmation = await generateDailyAffirmation(moodTexts);
      res.json({ affirmation });
    } catch (error) {
      console.error("Error generating affirmation:", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to generate affirmation"
      });
    }
  });
  app.get("/api/health", (req, res) => {
    res.json({
      status: "OK",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      database: mongoose3.connection.readyState === 1 ? "connected" : "disconnected"
    });
  });
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    console.error("Error:", err);
  });
  const port = process.env.PORT || 5e3;
  app.listen(port, () => {
    console.log(`\u{1F680} Server running on port ${port}`);
    console.log(`\u{1F4E1} API available at http://localhost:${port}/api`);
  });
})();
