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

import axios, {AxiosInstance} from 'axios';
import {
  Game,
  GameStatus,
  Sport,
  GamePeriod
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
  private client: AxiosInstance;
  
  // Base URLs for NBA CDN endpoints
  private readonly SCOREBOARD_URL = 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json';
  private readonly BOXSCORE_BASE_URL = 'https://cdn.nba.com/static/json/liveData/boxscore/boxscore_';
  
  constructor() {
    super();
    
    // No API key needed - these are public endpoints
    this.client = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SportsNotificationBot/1.0)',
        'Accept': 'application/json'
      }
    });
    
    console.log('[NBAProvider] Initialized with free NBA JSON endpoints');
  }
  
  /**
   * Fetch all NBA games for a specific date
   * 
   * Note: The NBA scoreboard endpoint always returns today's games.
   * For historical or future dates, you'd need a different endpoint.
   * For our use case (live notifications), today's games are what we need.
   */
  async fetchSchedule(date: Date): Promise<Game[]> {
    try {
      const dateStr = date.toISOString().split('T')[0];
      
      console.log(`[NBAProvider] Fetching schedule for ${dateStr}`);
      
      // NBA CDN endpoint returns today's scoreboard
      // For specific dates, we'd use: https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json
      // and filter by date, but for live notifications, today's scoreboard is sufficient
      const response = await this.client.get<NBAScoreboardResponse>(this.SCOREBOARD_URL);
      
      if (!response.data?.scoreboard?.games) {
        console.warn('[NBAProvider] No games found in scoreboard response');
        return [];
      }
      
      const games = response.data.scoreboard.games.map((game: NBAGame) => this.transformGame(game));
      
      console.log(`[NBAProvider] Found ${games.length} games for ${dateStr}`);
      console.log(`[NBAProvider] Game IDs: ${games.map((g: Game) => g.id).join(', ')}`);
      
      return games;
    } catch (error: any) {
      console.error('[NBAProvider] Error fetching schedule:', error.message);
      
      // Return empty array on error to prevent cascade failures
      // In production, consider retries with exponential backoff
      return [];
    }
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
      
      const response = await this.client.get<NBABoxScoreResponse>(boxscoreUrl);
      
      if (!response.data?.game) {
        throw new Error(`Invalid response for game ${gameId}`);
      }
      
      // Transform boxscore game data to NBAGame format for consistency
      const gameData: NBAGame = {
        gameId: response.data.game.gameId,
        gameCode: '',
        gameStatus: response.data.game.gameStatus,
        gameStatusText: response.data.game.gameStatusText,
        period: response.data.game.period,
        gameClock: response.data.game.gameClock,
        gameTimeUTC: response.data.game.gameTimeUTC,
        gameEt: response.data.game.gameTimeLocal,
        regulationPeriods: 4,
        seriesGameNumber: '',
        seriesText: '',
        homeTeam: response.data.game.homeTeam,
        awayTeam: response.data.game.awayTeam
      };
      
      return this.transformGame(gameData);
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
      id: `nba_${apiGame.gameId}`,
      sport: Sport.NBA,
      externalId: apiGame.gameId,
      
      scheduledTime,
      lastUpdated: new Date(),
      
      status,
      statusDetail: apiGame.gameStatusText,
      
      homeTeam: {
        id: `nba_team_${apiGame.homeTeam.teamId}`,
        name: `${apiGame.homeTeam.teamCity} ${apiGame.homeTeam.teamName}`,
        abbreviation: apiGame.homeTeam.teamTricode,
        score: apiGame.homeTeam.score,
        record: apiGame.homeTeam.wins && apiGame.homeTeam.losses ? 
          `${apiGame.homeTeam.wins}-${apiGame.homeTeam.losses}` : 
          undefined,
        isHome: true
      },
      
      awayTeam: {
        id: `nba_team_${apiGame.awayTeam.teamId}`,
        name: `${apiGame.awayTeam.teamCity} ${apiGame.awayTeam.teamName}`,
        abbreviation: apiGame.awayTeam.teamTricode,
        score: apiGame.awayTeam.score,
        record: apiGame.awayTeam.wins && apiGame.awayTeam.losses ? 
          `${apiGame.awayTeam.wins}-${apiGame.awayTeam.losses}` : 
          undefined,
        isHome: false
      },
      
      currentPeriod: apiGame.period || 0,
      totalPeriods: apiGame.regulationPeriods || 4, // NBA has 4 quarters (+ potential overtime)
      clock: apiGame.gameClock || '',
      
      // Parse period scores if available
      periods: this.parsePeriods(apiGame),
      
      venue: undefined, // Available in boxscore endpoint
      city: apiGame.homeTeam.teamCity,
      
      importance: isPlayoff ? 9 : 5, // Playoff games are more important
      tags: isPlayoff ? ['playoff'] : [],
      
      sportSpecificData: {
        gameCode: apiGame.gameCode,
        seriesText: apiGame.seriesText,
        seriesGameNumber: apiGame.seriesGameNumber,
        homeTeamId: apiGame.homeTeam.teamId,
        awayTeamId: apiGame.awayTeam.teamId,
        homeSeed: apiGame.homeTeam.seed,
        awaySeed: apiGame.awayTeam.seed
      },
      
      notificationsSent: []
    };
    
    return game;
  }
  
  /**
   * Parse period-by-period scores from NBA game data
   */
  private parsePeriods(apiGame: NBAGame): GamePeriod[] | undefined {
    const periods: GamePeriod[] = [];
    
    // Check if period data is available
    if (apiGame.homeTeam.periods && apiGame.awayTeam.periods) {
      const maxPeriods = Math.max(
        apiGame.homeTeam.periods.length,
        apiGame.awayTeam.periods.length
      );
      
      for (let i = 0; i < maxPeriods; i++) {
        const homePeriod = apiGame.homeTeam.periods[i];
        const awayPeriod = apiGame.awayTeam.periods[i];
        
        if (homePeriod && awayPeriod) {
          periods.push({
            number: homePeriod.period,
            label: homePeriod.period <= 4 ? `Q${homePeriod.period}` : `OT${homePeriod.period - 4}`,
            homeScore: homePeriod.score,
            awayScore: awayPeriod.score
          });
        }
      }
    }
    
    return periods.length > 0 ? periods : undefined;
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
