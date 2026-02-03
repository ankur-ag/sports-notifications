/**
 * NBA Provider implementation using balldontlie.io API
 * 
 * API choice rationale:
 * - balldontlie.io: Free tier available, 60 requests/minute
 * - Alternative: sportsdata.io (paid), espn.com/apis (unofficial)
 * - For production: Consider NBA's official stats API or paid provider
 * 
 * Cost optimization:
 * - Fetch schedule once per day (1 API call/day)
 * - Poll only live games every 5-10 minutes
 * - Estimated cost: ~50-100 API calls/day for 10-15 NBA games
 * 
 * Data source: https://www.balldontlie.io/home.html#introduction
 */

import axios, { AxiosInstance } from 'axios';
import {
  Game,
  GameStatus,
  Sport,
  Team,
  GamePeriod,
  getPointDifferential
} from '../models/Game';
import { Event, EventType, EventPriority, generateEventId } from '../models/Event';
import { BaseSportProvider } from './SportProvider';

interface BalldontlieGame {
  id: number;
  date: string;
  season: number;
  status: string;
  period: number;
  time: string;
  postseason: boolean;
  home_team: {
    id: number;
    abbreviation: string;
    city: string;
    conference: string;
    division: string;
    full_name: string;
    name: string;
  };
  home_team_score: number;
  visitor_team: {
    id: number;
    abbreviation: string;
    city: string;
    conference: string;
    division: string;
    full_name: string;
    name: string;
  };
  visitor_team_score: number;
}

export class NBAProvider extends BaseSportProvider {
  readonly sport = Sport.NBA;
  private client: AxiosInstance;
  private apiKey: string;
  
  constructor(apiKey?: string) {
    super();
    
    // API key is optional for balldontlie free tier, but recommended
    this.apiKey = apiKey || process.env.NBA_API_KEY || '';
    
    this.client = axios.create({
      baseURL: 'https://www.balldontlie.io/api/v1',
      timeout: 10000,
      headers: this.apiKey ? { 'Authorization': this.apiKey } : {}
    });
  }
  
  /**
   * Fetch all NBA games for a specific date
   */
  async fetchSchedule(date: Date): Promise<Game[]> {
    try {
      // Format date as YYYY-MM-DD
      const dateStr = date.toISOString().split('T')[0];
      
      console.log(`[NBAProvider] Fetching schedule for ${dateStr}`);
      
      const response = await this.client.get<{ data: BalldontlieGame[] }>('/games', {
        params: {
          dates: [dateStr],
          per_page: 100 // Get all games for the day
        }
      });
      
      const games = response.data.data.map(game => this.transformGame(game));
      
      console.log(`[NBAProvider] Found ${games.length} games for ${dateStr}`);
      
      return games;
    } catch (error) {
      console.error('[NBAProvider] Error fetching schedule:', error);
      
      // Return empty array on error to prevent cascade failures
      // In production, consider retries with exponential backoff
      return [];
    }
  }
  
  /**
   * Fetch detailed information for a specific NBA game
   */
  async fetchGame(gameId: string): Promise<Game> {
    try {
      console.log(`[NBAProvider] Fetching game ${gameId}`);
      
      const response = await this.client.get<BalldontlieGame>(`/games/${gameId}`);
      
      return this.transformGame(response.data);
    } catch (error) {
      console.error(`[NBAProvider] Error fetching game ${gameId}:`, error);
      throw error;
    }
  }
  
  /**
   * Transform balldontlie API response to our normalized Game model
   */
  private transformGame(apiGame: BalldontlieGame): Game {
    // Map API status to our GameStatus enum
    const status = this.mapStatus(apiGame.status);
    
    const game: Game = {
      id: `nba_${apiGame.id}`,
      sport: Sport.NBA,
      externalId: apiGame.id.toString(),
      
      scheduledTime: new Date(apiGame.date),
      lastUpdated: new Date(),
      
      status,
      statusDetail: apiGame.status,
      
      homeTeam: {
        id: `nba_team_${apiGame.home_team.id}`,
        name: apiGame.home_team.full_name,
        abbreviation: apiGame.home_team.abbreviation,
        score: apiGame.home_team_score,
        isHome: true
      },
      
      awayTeam: {
        id: `nba_team_${apiGame.visitor_team.id}`,
        name: apiGame.visitor_team.full_name,
        abbreviation: apiGame.visitor_team.abbreviation,
        score: apiGame.visitor_team_score,
        isHome: false
      },
      
      currentPeriod: apiGame.period,
      totalPeriods: 4, // NBA has 4 quarters (+ potential overtime)
      clock: apiGame.time,
      
      venue: undefined, // Not provided by balldontlie API
      city: apiGame.home_team.city,
      
      importance: apiGame.postseason ? 9 : 5, // Playoff games are more important
      tags: apiGame.postseason ? ['playoff'] : [],
      
      sportSpecificData: {
        season: apiGame.season,
        postseason: apiGame.postseason,
        homeConference: apiGame.home_team.conference,
        awayConference: apiGame.visitor_team.conference
      },
      
      notificationsSent: []
    };
    
    return game;
  }
  
  /**
   * Map API status strings to our GameStatus enum
   */
  private mapStatus(apiStatus: string): GameStatus {
    // balldontlie uses: "Final", "In Progress", "Scheduled", etc.
    const statusLower = apiStatus.toLowerCase();
    
    if (statusLower.includes('final')) return GameStatus.FINAL;
    if (statusLower.includes('progress') || statusLower.includes('live')) return GameStatus.LIVE;
    if (statusLower.includes('postponed')) return GameStatus.POSTPONED;
    if (statusLower.includes('cancelled')) return GameStatus.CANCELLED;
    
    return GameStatus.SCHEDULED;
  }
  
  /**
   * Detect NBA-specific events
   * 
   * Inherits common event detection from BaseSportProvider,
   * but can add NBA-specific events here (e.g., triple-double alerts)
   */
  detectEvents(oldGame: Game | null, newGame: Game): Event[] {
    // Use base implementation for common events
    const events = super.detectEvents(oldGame, newGame);
    
    // Add NBA-specific event detection here
    // Example: Detect overtime (period > 4)
    if (newGame.currentPeriod && newGame.currentPeriod > 4) {
      if (!oldGame || !oldGame.currentPeriod || oldGame.currentPeriod <= 4) {
        events.push({
          id: generateEventId(newGame.id, EventType.OVERTIME),
          type: EventType.OVERTIME,
          priority: EventPriority.HIGH,
          gameId: newGame.id,
          sport: newGame.sport,
          detectedAt: new Date(),
          title: 'Overtime!',
          message: `${newGame.awayTeam.abbreviation} @ ${newGame.homeTeam.abbreviation} is going to OT!`,
          notified: false,
          targetAudience: {
            teams: [newGame.homeTeam.id, newGame.awayTeam.id]
          }
        });
      }
    }
    
    return events;
  }
  
  /**
   * Validate NBA API configuration
   */
  validateConfiguration(): boolean {
    // API key is optional for free tier, but log warning if missing
    if (!this.apiKey) {
      console.warn('[NBAProvider] No API key configured. Using free tier limits.');
    }
    
    // Could test API connectivity here
    return true;
  }
}

/**
 * Factory function to create and register NBA provider
 */
export function createNBAProvider(apiKey?: string): NBAProvider {
  return new NBAProvider(apiKey);
}
