import { z } from "zod";

// Validation schemas for API requests
export const insertMoodEntrySchema = z.object({
  text: z.string().min(1, "Mood text is required"),
  emoji: z.string().min(1, "Emoji is required"),
  quickMood: z.string().min(1, "Quick mood is required"),
  energy: z.number().min(1, "Energy must be at least 1").max(10, "Energy must be at most 10"),
  valence: z.number().min(1, "Valence must be at least 1").max(10, "Valence must be at most 10"),
});

export const insertSavedPlaylistSchema = z.object({
  name: z.string().min(1, "Playlist name is required"),
  description: z.string().optional(),
  moodEntryIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid mood entry ID")),
});

// TypeScript types for the API
export type InsertMoodEntry = z.infer<typeof insertMoodEntrySchema>;
export type InsertSavedPlaylist = z.infer<typeof insertSavedPlaylistSchema>;

// API response types
export interface MoodEntry {
  _id: string;
  id: string; // Frontend compatibility
  text: string;
  emoji: string;
  quickMood: string;
  energy: number;
  valence: number;
  createdAt: Date;
}

export interface AiReflection {
  _id: string;
  moodEntryId: string;
  content: string;
  createdAt: Date;
}

export interface SpotifyRecommendation {
  _id: string;
  moodEntryId: string;
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  albumImageUrl?: string | null;
  previewUrl?: string | null;
  energy: number;
  valence: number;
  createdAt: Date;
}

export interface SavedPlaylist {
  _id: string;
  name: string;
  description?: string | null;
  moodEntryIds: string[];
  createdAt: Date;
}

// Combined interfaces for frontend
export interface MoodEntryWithReflection {
  moodEntry: MoodEntry;
  aiReflection: AiReflection | null;
  recommendations?: SpotifyRecommendation[];
}
