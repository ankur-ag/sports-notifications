/**
 * SportProvider interface - the contract for all sport data providers.
 * 
 * Design philosophy:
 * - Provider pattern: Abstracts away specific API implementations
 * - Sport-agnostic: Same interface works for NBA, NFL, MLB, etc.
 * - Pluggable: Easy to swap providers or add new sports
 * - Normalized output: All providers return the same Game model
 * 
 * Implementation notes:
 * - Each provider is responsible for transforming their API data into our Game model
 * - Providers should handle their own rate limiting and error handling
 * - Providers should be stateless (no internal caching)
 */

import { Game, Sport } from '../models/Game';
import { Event } from '../models/Event';

export interface SportProvider {
  /**
   * The sport this provider handles
   */
  readonly sport: Sport;
  
  /**
   * Fetch the schedule for a specific date
   * 
   * @param date - The date to fetch games for
   * @returns Array of games scheduled for that date
   * 
   * Use case: Called once per day to populate the schedule
   * Cost consideration: Single API call per day per sport
   */
  fetchSchedule(date: Date): Promise<Game[]>;
  
  /**
   * Fetch detailed information for a specific game
   * 
   * @param gameId - The external game ID from the provider
   * @returns Complete game data including live scores if available
   * 
   * Use case: Called every 5-10 minutes for live games
   * Cost consideration: One API call per live game per poll
   */
  fetchGame(gameId: string): Promise<Game>;
  
  /**
   * Detect events by comparing old and new game state
   * 
   * @param oldGame - Previous game state (or null if first fetch)
   * @param newGame - Current game state
   * @returns Array of events detected
   * 
   * Design note: Event detection logic lives in the provider because
   * some sports have unique events (e.g., touchdowns in NFL, home runs in MLB).
   * However, common events (GAME_START, GAME_END, BLOWOUT) should use shared logic.
   * 
   * Cost consideration: No API calls, pure computation
   */
  detectEvents(oldGame: Game | null, newGame: Game): Event[];
  
  /**
   * Validate that the provider is properly configured
   * 
   * @returns true if API keys and configuration are valid
   * 
   * Use case: Called on startup to fail fast if configuration is missing
   */
  validateConfiguration(): boolean;
}

/**
 * Base provider class with shared event detection logic
 * 
 * Concrete providers should extend this and override sport-specific methods
 */
export abstract class BaseSportProvider implements SportProvider {
  abstract readonly sport: Sport;
  
  abstract fetchSchedule(date: Date): Promise<Game[]>;
  abstract fetchGame(gameId: string): Promise<Game>;
  
  /**
   * Default event detection - can be overridden by specific providers
   */
  detectEvents(oldGame: Game | null, newGame: Game): Event[] {
    const events: Event[] = [];
    
    // Import here to avoid circular dependency
    const { detectCommonEvents } = require('../engine/eventDetector');
    
    return detectCommonEvents(oldGame, newGame);
  }
  
  /**
   * Default configuration validation
   */
  validateConfiguration(): boolean {
    // Override in subclass to check API keys
    return true;
  }
}

/**
 * Provider registry for easy lookup
 * 
 * Usage:
 *   const provider = ProviderRegistry.getProvider(Sport.NBA);
 *   const games = await provider.fetchSchedule(new Date());
 */
export class ProviderRegistry {
  private static providers: Map<Sport, SportProvider> = new Map();
  
  static register(provider: SportProvider): void {
    this.providers.set(provider.sport, provider);
  }
  
  static getProvider(sport: Sport): SportProvider {
    const provider = this.providers.get(sport);
    if (!provider) {
      throw new Error(`No provider registered for sport: ${sport}`);
    }
    return provider;
  }
  
  static getAllProviders(): SportProvider[] {
    return Array.from(this.providers.values());
  }
  
  static getSupportedSports(): Sport[] {
    return Array.from(this.providers.keys());
  }
}
