/**
 * Generic Game model that normalizes sports data across all providers.
 * 
 * Design philosophy:
 * - Sport-agnostic: Works for NBA, NFL, MLB, Soccer, etc.
 * - Provider-agnostic: Can be populated from any data source
 * - Extensible: sportSpecificData allows custom fields per sport
 */

export enum GameStatus {
  SCHEDULED = 'SCHEDULED',
  LIVE = 'LIVE',
  FINAL = 'FINAL',
  POSTPONED = 'POSTPONED',
  CANCELLED = 'CANCELLED'
}

export enum Sport {
  NBA = 'NBA',
  NFL = 'NFL',
  MLB = 'MLB',
  NHL = 'NHL',
  SOCCER = 'SOCCER'
}

export interface Team {
  id: string;
  name: string;
  abbreviation: string;
  score?: number;
  record?: string; // e.g., "45-20"
  isHome: boolean;
}

export interface GamePeriod {
  number: number;
  label: string; // "Q1", "Q2", "Inning 1", "Period 1", "Half 1", etc.
  homeScore?: number;
  awayScore?: number;
}

export interface Game {
  // Universal identifiers
  id: string; // Unique game ID (provider-specific, e.g., "nba_2024_12345")
  sport: Sport;
  externalId: string; // Original ID from the data provider
  
  // Temporal data
  scheduledTime: Date;
  startTime?: Date; // Actual start time (may differ from scheduled)
  endTime?: Date;
  lastUpdated: Date;
  
  // Status
  status: GameStatus;
  statusDetail?: string; // e.g., "Halftime", "End of 3rd Quarter", "Rain Delay"
  
  // Teams
  homeTeam: Team;
  awayTeam: Team;
  
  // Game progress
  currentPeriod?: number;
  totalPeriods?: number;
  periods?: GamePeriod[];
  clock?: string; // Time remaining, e.g., "5:23" or "2 outs"
  
  // Location
  venue?: string;
  city?: string;
  
  // Metadata
  importance?: number; // 1-10 scale for playoff games, rivalries, etc.
  tags?: string[]; // e.g., ["playoff", "rivalry", "championship"]
  
  // Sport-specific data (use sparingly, prefer generic fields)
  sportSpecificData?: Record<string, any>;
  
  // Notification tracking
  notificationsSent?: string[]; // Event IDs that have been notified
}

/**
 * Helper function to calculate point differential
 */
export function getPointDifferential(game: Game): number | null {
  if (game.homeTeam.score === undefined || game.awayTeam.score === undefined) {
    return null;
  }
  return Math.abs(game.homeTeam.score - game.awayTeam.score);
}

/**
 * Helper function to determine if game is in progress
 */
export function isGameLive(game: Game): boolean {
  return game.status === GameStatus.LIVE;
}

/**
 * Helper function to check if game has started
 */
export function hasGameStarted(game: Game): boolean {
  return game.status !== GameStatus.SCHEDULED && game.status !== GameStatus.POSTPONED;
}
