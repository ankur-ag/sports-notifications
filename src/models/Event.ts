/**
 * Event model representing detectable game events that trigger notifications.
 * 
 * Design philosophy:
 * - Idempotent: Same event should produce same ID to prevent duplicate notifications
 * - Sport-agnostic: Event types are generic enough to apply across sports
 * - Extensible: Easy to add new event types without breaking existing code
 */

export enum EventType {
  // Game lifecycle events
  GAME_START = 'GAME_START',
  GAME_END = 'GAME_END',
  GAME_POSTPONED = 'GAME_POSTPONED',
  GAME_CANCELLED = 'GAME_CANCELLED',
  
  // Score-based events
  CLOSE_GAME = 'CLOSE_GAME',           // Within X points in final period
  BLOWOUT = 'BLOWOUT',                  // Point differential > threshold
  COMEBACK = 'COMEBACK',                // Team overcomes large deficit
  
  // Contextual events
  UPSET = 'UPSET',                      // Underdog winning/won
  RIVALRY_GAME = 'RIVALRY_GAME',        // Pre-determined rivalry matchup
  PLAYOFF_GAME = 'PLAYOFF_GAME',        // Playoff/championship game
  
  // Time-based events
  HALFTIME = 'HALFTIME',
  FINAL_PERIOD = 'FINAL_PERIOD',        // Entering final quarter/period
  OVERTIME = 'OVERTIME',
  
  // Custom/future events
  CUSTOM = 'CUSTOM'
}

export enum EventPriority {
  LOW = 1,
  MEDIUM = 2,
  HIGH = 3,
  CRITICAL = 4
}

export interface Event {
  // Unique identifier - must be deterministic for idempotency
  // Format: {gameId}_{eventType}_{timestamp?}
  id: string;
  
  // Event classification
  type: EventType;
  priority: EventPriority;
  
  // Associated game
  gameId: string;
  sport: string;
  
  // Temporal data
  detectedAt: Date;
  occurredAt?: Date; // When the event actually happened (vs. when detected)
  
  // Event details
  title: string;
  message: string;
  
  // Notification state
  notified: boolean;
  notifiedAt?: Date;
  
  // Context
  metadata?: Record<string, any>; // Additional data for the event
  
  // Targeting (who should receive this notification)
  targetAudience?: {
    allUsers?: boolean;
    userIds?: string[];
    teams?: string[]; // Team IDs that fans should be notified about
    tags?: string[]; // User preference tags (e.g., "playoffs", "rivalries")
  };
}

/**
 * Helper function to generate deterministic event ID
 */
export function generateEventId(
  gameId: string,
  eventType: EventType,
  suffix?: string
): string {
  const parts = [gameId, eventType];
  if (suffix) {
    parts.push(suffix);
  }
  return parts.join('_');
}

/**
 * Helper function to determine if event should trigger notification
 */
export function shouldNotify(event: Event): boolean {
  return !event.notified && event.priority >= EventPriority.MEDIUM;
}

/**
 * Event detection thresholds (configurable via environment variables)
 */
export const EVENT_THRESHOLDS = {
  BLOWOUT_POINT_DIFFERENTIAL: 20,      // Points ahead to be considered a blowout
  CLOSE_GAME_POINT_DIFFERENTIAL: 5,    // Points within to be considered close
  COMEBACK_POINT_DIFFERENTIAL: 15,     // Points to overcome for comeback
  FINAL_PERIOD_THRESHOLD: 0.75,        // 75% through game to enter "final period" mode
};
