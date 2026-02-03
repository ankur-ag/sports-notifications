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

// Simplified, flat structure for easy readability in Firestore
export interface Game {
  // Identifiers
  id: string; // e.g., "nba_0022600800"
  sport: Sport;
  externalId: string;
  
  // Time
  scheduledTime: Date;
  lastUpdated: Date;
  
  // Status
  status: GameStatus;
  statusDetail?: string; // e.g., "Halftime", "End of 3rd"
  
  // Home team (flattened)
  homeTeam: string; // e.g., "Los Angeles Lakers"
  homeAbbr: string; // e.g., "LAL"
  homeScore: number;
  homeRecord?: string; // e.g., "30-15"
  
  // Away team (flattened)
  awayTeam: string;
  awayAbbr: string;
  awayScore: number;
  awayRecord?: string;
  
  // Game state
  period?: number; // Current quarter/period
  clock?: string; // e.g., "5:23"
  
  // Metadata (only what we need)
  isPlayoff?: boolean;
  
  // Notification tracking
  notificationsSent?: string[]; // Event IDs already notified
}

/**
 * Helper function to calculate point differential
 */
export function getPointDifferential(game: Game): number {
  return Math.abs(game.homeScore - game.awayScore);
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
