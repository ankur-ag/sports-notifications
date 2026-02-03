/**
 * NBA Provider implementation using NBA's official JSON endpoints
 * 
 * API choice rationale:
 * - NBA CDN endpoints: FREE, no API key required
 * - Live scores and real-time updates
 * - Same data source that powers NBA.com
 * - No rate limits (reasonable usage)
 * 
 * Cost optimization:
 * - Fetch schedule once per day (1 API call/day)
 * - Poll only live games every 5-10 minutes
 * - Estimated: ~50-100 API calls/day for 10-15 NBA games
 * - Total cost: $0 (completely free)
 * 
 * Data sources:
 * - Scoreboard: https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json
 * - Game details: https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{gameId}.json
 * 
 * Note: These are unofficial but publicly accessible endpoints used by NBA.com
 */

import {
  Game,
  GameStatus,
  Sport
} from '../models/Game';
import {Event, EventType, EventPriority, generateEventId} from '../models/Event';
import {BaseSportProvider} from './SportProvider';

/**
 * NBA API Response Types
 * Based on https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json
 */
interface NBAScoreboardResponse {
  scoreboard: {
    gameDate: string;
    leagueId: string;
    leagueName: string;
    games: NBAGame[];
  };
}

interface NBAGame {
  gameId: string;
  gameCode: string;
  gameStatus: number; // 1 = scheduled, 2 = live, 3 = final
  gameStatusText: string;
  period: number;
  gameClock: string;
  gameTimeUTC: string;
  gameEt: string;
  regulationPeriods: number;
  seriesGameNumber: string;
  seriesText: string;
  homeTeam: NBATeam;
  awayTeam: NBATeam;
  gameLeaders?: {
    homeLeaders?: {
      points: number;
      rebounds: number;
      assists: number;
    };
    awayLeaders?: {
      points: number;
      rebounds: number;
      assists: number;
    };
  };
  pointsLeaders?: any[];
}

interface NBATeam {
  teamId: number;
  teamName: string;
  teamCity: string;
  teamTricode: string; // 3-letter abbreviation
  score: number;
  wins: number;
  losses: number;
  seed?: number;
  inBonus?: string;
  timeoutsRemaining?: number;
  periods?: Array<{
    period: number;
    periodType: string;
    score: number;
  }>;
}

/**
 * Box score response for individual game details
 */
interface NBABoxScoreResponse {
  game: {
    gameId: string;
    gameTimeLocal: string;
    gameTimeUTC: string;
    gameStatus: number;
    gameStatusText: string;
    period: number;
    gameClock: string;
    homeTeam: NBATeam;
    awayTeam: NBATeam;
    arena?: {
      arenaName: string;
      arenaCity: string;
      arenaState: string;
    };
  };
}

export class NBAProvider extends BaseSportProvider {
  readonly sport = Sport.NBA;
  
  // Base URLs for NBA CDN endpoints
  private readonly SCOREBOARD_URL = 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json';
  private readonly BOXSCORE_BASE_URL = 'https://cdn.nba.com/static/json/liveData/boxscore/boxscore_';
  
  constructor() {
    super();
    console.log('[NBAProvider] Initialized with free NBA JSON endpoints (using native fetch)');
  }
  
  /**
   * Fetch all NBA games for a specific date
   * 
   * Note: The NBA scoreboard endpoint always returns today's games.
   * For historical or future dates, you'd need a different endpoint.
   * For our use case (live notifications), today's games are what we need.
   */
  async fetchSchedule(date: Date): Promise<Game[]> {
    const dateStr = date.toISOString().split('T')[0];
    console.log(`[NBAProvider] Fetching schedule for ${dateStr}`);
    
    // Simple retry logic for network resilience
    const maxRetries = 1; // 2 total attempts
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        // Use native fetch with AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        try {
          // NBA CDN endpoint
          const response = await fetch(this.SCOREBOARD_URL, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0',
              'Accept': 'application/json',
              'Referer': 'https://www.nba.com',
              'Accept-Language': 'en-US,en;q=0.9'
            }
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const data: NBAScoreboardResponse = await response.json();
          
          if (!data?.scoreboard?.games) {
            console.warn('[NBAProvider] No games found in scoreboard response');
            return [];
          }
          
          const games = data.scoreboard.games.map((game: NBAGame) => this.transformGame(game));
          
          console.log(`[NBAProvider] Successfully fetched ${games.length} games for ${dateStr}`);
          if (games.length > 0) {
            console.log(`[NBAProvider] Game IDs: ${games.map((g: Game) => g.id).join(', ')}`);
          }
          
          return games;
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error: any) {
        lastError = error;
        console.error(`[NBAProvider] Fetch attempt ${attempt} failed:`, error.message);
        
        // Retry once after 2 seconds
        if (attempt === 1) {
          console.log(`[NBAProvider] Retrying in 2s...`);
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
    
    // Both attempts failed
    console.error(`[NBAProvider] Failed to fetch schedule:`, lastError?.message);
    return [];
  }
  
  /**
   * Fetch detailed information for a specific NBA game
   * 
   * @param gameId - The external game ID (e.g., "0022300001")
   */
  async fetchGame(gameId: string): Promise<Game> {
    try {
      console.log(`[NBAProvider] Fetching game ${gameId}`);
      
      // For individual game details, use boxscore endpoint
      // Format: https://cdn.nba.com/static/json/liveData/boxscore/boxscore_0022300001.json
      const boxscoreUrl = `${this.BOXSCORE_BASE_URL}${gameId}.json`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        const response = await fetch(boxscoreUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'application/json',
            'Referer': 'https://www.nba.com',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data: NBABoxScoreResponse = await response.json();
        
        if (!data?.game) {
          throw new Error(`Invalid response for game ${gameId}`);
        }
        
        // Transform boxscore game data to NBAGame format for consistency
        const gameData: NBAGame = {
          gameId: data.game.gameId,
          gameCode: '',
          gameStatus: data.game.gameStatus,
          gameStatusText: data.game.gameStatusText,
          period: data.game.period,
          gameClock: data.game.gameClock,
          gameTimeUTC: data.game.gameTimeUTC,
          gameEt: data.game.gameTimeLocal,
          regulationPeriods: 4,
          seriesGameNumber: '',
          seriesText: '',
          homeTeam: data.game.homeTeam,
          awayTeam: data.game.awayTeam
        };
        
        return this.transformGame(gameData);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error: any) {
      console.error(`[NBAProvider] Error fetching game ${gameId}:`, error.message);
      throw error;
    }
  }
  
  /**
   * Transform NBA JSON API response to our normalized Game model
   */
  private transformGame(apiGame: NBAGame): Game {
    // Map NBA gameStatus codes to our GameStatus enum
    const status = this.mapStatus(apiGame.gameStatus, apiGame.gameStatusText);
    
    // Parse scheduled time from UTC
    const scheduledTime = new Date(apiGame.gameTimeUTC);
    
    // Determine if this is a playoff game based on gameCode or seriesText
    const isPlayoff = apiGame.seriesText?.length > 0 || 
                      apiGame.gameCode?.includes('playoffs') ||
                      apiGame.seriesGameNumber?.length > 0;
    
    const game: Game = {
      // Identifiers
      id: `nba_${apiGame.gameId}`,
      sport: Sport.NBA,
      externalId: apiGame.gameId,
      
      // Time
      scheduledTime,
      lastUpdated: new Date(),
      
      // Status
      status,
      statusDetail: apiGame.gameStatusText,
      
      // Home team (flattened)
      homeTeam: `${apiGame.homeTeam.teamCity} ${apiGame.homeTeam.teamName}`,
      homeAbbr: apiGame.homeTeam.teamTricode,
      homeScore: apiGame.homeTeam.score || 0,
      homeRecord: apiGame.homeTeam.wins && apiGame.homeTeam.losses ? 
        `${apiGame.homeTeam.wins}-${apiGame.homeTeam.losses}` : 
        undefined,
      
      // Away team (flattened)
      awayTeam: `${apiGame.awayTeam.teamCity} ${apiGame.awayTeam.teamName}`,
      awayAbbr: apiGame.awayTeam.teamTricode,
      awayScore: apiGame.awayTeam.score || 0,
      awayRecord: apiGame.awayTeam.wins && apiGame.awayTeam.losses ? 
        `${apiGame.awayTeam.wins}-${apiGame.awayTeam.losses}` : 
        undefined,
      
      // Game state
      period: apiGame.period || undefined,
      clock: apiGame.gameClock || undefined,
      
      // Metadata
      isPlayoff,
      
      // Notification tracking
      notificationsSent: []
    };
    
    return game;
  }
  
  
  /**
   * Map NBA gameStatus codes to our GameStatus enum
   * 
   * NBA Status Codes:
   * 1 = Game scheduled (not started)
   * 2 = Game in progress (live)
   * 3 = Game finished (final)
   */
  private mapStatus(statusCode: number, statusText: string): GameStatus {
    // Use status code as primary indicator
    switch (statusCode) {
      case 1:
        return GameStatus.SCHEDULED;
      case 2:
        return GameStatus.LIVE;
      case 3:
        return GameStatus.FINAL;
      default:
        // Fallback to text parsing if status code is unexpected
        const textLower = statusText.toLowerCase();
        if (textLower.includes('final')) return GameStatus.FINAL;
        if (textLower.includes('live') || textLower.includes('progress')) return GameStatus.LIVE;
        if (textLower.includes('postponed') || textLower.includes('ppd')) return GameStatus.POSTPONED;
        if (textLower.includes('cancelled') || textLower.includes('canceled')) return GameStatus.CANCELLED;
        
        console.warn(`[NBAProvider] Unknown game status: ${statusCode} - ${statusText}`);
        return GameStatus.SCHEDULED;
    }
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
    if (newGame.period && newGame.period > 4) {
      if (!oldGame || !oldGame.period || oldGame.period <= 4) {
        events.push({
          id: generateEventId(newGame.id, EventType.OVERTIME),
          type: EventType.OVERTIME,
          priority: EventPriority.HIGH,
          gameId: newGame.id,
          sport: newGame.sport,
          detectedAt: new Date(),
          title: 'Overtime!',
          message: `${newGame.awayAbbr} @ ${newGame.homeAbbr} is going to OT!`,
          notified: false,
          targetAudience: {
            teams: [newGame.homeAbbr, newGame.awayAbbr]
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
    // No API key needed for NBA JSON endpoints
    console.log('[NBAProvider] Using free NBA JSON endpoints - no API key required');
    
    // Could test API connectivity here with a sample request
    return true;
  }
}

/**
 * Factory function to create and register NBA provider
 * 
 * Note: No API key needed - uses free NBA JSON endpoints
 */
export function createNBAProvider(): NBAProvider {
  return new NBAProvider();
}
