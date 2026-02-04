/**
 * User preferences model for managing notification subscriptions.
 * 
 * Design philosophy:
 * - Granular control: Users can subscribe to specific teams, events, or sports
 * - Privacy-first: Only store necessary data
 * - Scalable: Structure allows efficient Firestore queries
 */

import {EventType, Sport} from './Event';

export interface UserPreferences {
  // User identification
  userId: string;
  fcmToken: string; // Firebase Cloud Messaging token
  
  // Device info (for debugging and analytics)
  platform?: 'ios' | 'android';
  appVersion?: string;
  lastActive?: Date;
  
  // Notification preferences
  enabled: boolean; // Master switch for all notifications
  
  // Sport subscriptions
  sports: {
    [key in Sport]?: {
      enabled: boolean;
      teams?: string[]; // Team IDs user follows (legacy, for backwards compatibility)
      favoriteTeam?: string; // User's favorite team abbreviation (e.g., "LAL")
      rivalTeams?: string[]; // Up to 3 rival team abbreviations (e.g., ["GSW", "BOS"])
      eventTypes?: EventType[]; // Specific events to notify about
    };
  };
  
  // Event type preferences (global, across all sports)
  eventTypePreferences?: {
    [key in EventType]?: boolean;
  };
  
  // Notification schedule (quiet hours)
  quietHours?: {
    enabled: boolean;
    start: string; // HH:mm format, e.g., "22:00"
    end: string; // HH:mm format, e.g., "08:00"
    timezone?: string; // IANA timezone, e.g., "America/New_York"
  };
  
  // Subscription tier (for future premium features)
  isPremium?: boolean;
  subscriptionExpiry?: Date;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Helper function to check if user should receive notification for a specific event
 * 
 * NEW LOGIC: Only notify if the user's favorite team is playing against a rival team
 */
export function shouldNotifyUser(
  preferences: UserPreferences,
  sport: Sport,
  eventType: EventType,
  teamIds?: string[] // [homeTeamAbbr, awayTeamAbbr] for the game
): boolean {
  // Master switch
  if (!preferences.enabled) {
    return false;
  }
  
  // Check sport subscription
  const sportPrefs = preferences.sports[sport];
  if (!sportPrefs || !sportPrefs.enabled) {
    return false;
  }
  
  // NEW: Check favorite team vs rival teams matchup
  // Only send notifications for games where favorite team plays against a rival
  if (sportPrefs.favoriteTeam && sportPrefs.rivalTeams && teamIds) {
    const [homeTeam, awayTeam] = teamIds;
    const favoriteTeam = sportPrefs.favoriteTeam;
    const rivalTeams = sportPrefs.rivalTeams;
    
    // Check if this is a favorite vs rival matchup
    const isFavoriteHome = homeTeam === favoriteTeam;
    const isFavoriteAway = awayTeam === favoriteTeam;
    const isRivalHome = rivalTeams.includes(homeTeam);
    const isRivalAway = rivalTeams.includes(awayTeam);
    
    // Notify only if favorite team is playing AND opponent is a rival
    const isRivalryGame = (isFavoriteHome && isRivalAway) || (isFavoriteAway && isRivalHome);
    
    if (!isRivalryGame) {
      return false;
    }
  } else if (teamIds && sportPrefs.teams) {
    // LEGACY: Fall back to generic team subscription (backwards compatibility)
    const hasTeamMatch = teamIds.some((teamId) => 
      sportPrefs.teams?.includes(teamId)
    );
    if (!hasTeamMatch) {
      return false;
    }
  }
  
  // Check event type preference
  if (sportPrefs.eventTypes && !sportPrefs.eventTypes.includes(eventType)) {
    return false;
  }
  
  // Check global event type preference
  if (
    preferences.eventTypePreferences && 
    preferences.eventTypePreferences[eventType] === false
  ) {
    return false;
  }
  
  // Check quiet hours
  if (preferences.quietHours?.enabled) {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const {start, end} = preferences.quietHours;
    
    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (start > end) {
      if (currentTime >= start || currentTime <= end) {
        return false;
      }
    } else {
      if (currentTime >= start && currentTime <= end) {
        return false;
      }
    }
  }
  
  return true;
}

/**
 * Helper function to create default preferences for a new user
 */
export function createDefaultPreferences(
  userId: string,
  fcmToken: string,
  platform?: 'ios' | 'android'
): UserPreferences {
  return {
    userId,
    fcmToken,
    platform,
    enabled: true,
    sports: {
      [Sport.NBA]: {
        enabled: true,
        eventTypes: [
          EventType.GAME_START,
          EventType.GAME_END,
          EventType.CLOSE_GAME,
          EventType.BLOWOUT,
          EventType.UPSET
        ]
      }
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };
}
