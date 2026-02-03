/**
 * User preferences model for managing notification subscriptions.
 * 
 * Design philosophy:
 * - Granular control: Users can subscribe to specific teams, events, or sports
 * - Privacy-first: Only store necessary data
 * - Scalable: Structure allows efficient Firestore queries
 */

import { EventType, Sport } from './Event';

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
      teams?: string[]; // Team IDs user follows
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
 */
export function shouldNotifyUser(
  preferences: UserPreferences,
  sport: Sport,
  eventType: EventType,
  teamIds?: string[]
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
  
  // Check team subscription (if teams are specified)
  if (teamIds && sportPrefs.teams) {
    const hasTeamMatch = teamIds.some(teamId => 
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
    
    const { start, end } = preferences.quietHours;
    
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
