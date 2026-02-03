/**
 * Notification engine - orchestrates event detection, user targeting, and notification dispatch.
 * 
 * Design philosophy:
 * - Orchestration layer: Coordinates between event detection, targeting, and sending
 * - Idempotent: Prevents duplicate notifications via event tracking
 * - Resilient: Continues processing even if individual notifications fail
 * - Observable: Comprehensive logging for debugging and monitoring
 * 
 * Flow:
 * 1. Receive events from event detector
 * 2. Filter already-notified events
 * 3. Query users who should receive each event
 * 4. Send notifications via FCM
 * 5. Mark events as notified in database
 */

import {Event} from '../models/Event';
import {Game} from '../models/Game';
import {UserPreferences, shouldNotifyUser} from '../models/UserPreferences';
import {eventRepository, userPreferencesRepository} from '../services/firestore';
import {fcmService} from '../services/fcm';

/**
 * Main notification engine class
 */
export class NotificationEngine {
  /**
   * Process detected events and send notifications
   * 
   * @param events - Array of detected events
   * @returns Number of notifications sent
   */
  async processEvents(events: Event[]): Promise<number> {
    if (events.length === 0) {
      console.log('[NotificationEngine] No events to process');
      return 0;
    }
    
    console.log(`[NotificationEngine] Processing ${events.length} events`);
    
    let totalNotificationsSent = 0;
    
    for (const event of events) {
      try {
        // Check if event was already notified
        const existingEvent = await eventRepository.getEvent(event.id);
        if (existingEvent?.notified) {
          console.log(`[NotificationEngine] Event ${event.id} already notified, skipping`);
          continue;
        }
        
        // Save event to database
        await eventRepository.saveEvent(event);
        
        // Get target users for this event
        const targetUsers = await this.getTargetUsers(event);
        
        if (targetUsers.length === 0) {
          console.log(`[NotificationEngine] No target users for event ${event.id}`);
          continue;
        }
        
        console.log(`[NotificationEngine] Found ${targetUsers.length} target users for event ${event.id}`);
        
        // Send notifications
        const result = await fcmService.sendEventNotification(event, targetUsers);
        
        console.log(`[NotificationEngine] Sent ${result.successCount} notifications for event ${event.id}`);
        
        totalNotificationsSent += result.successCount;
        
        // Mark event as notified
        await eventRepository.markEventNotified(event.id);
      } catch (error) {
        console.error(`[NotificationEngine] Error processing event ${event.id}:`, error);
        // Continue processing other events
      }
    }
    
    console.log(`[NotificationEngine] Total notifications sent: ${totalNotificationsSent}`);
    
    return totalNotificationsSent;
  }
  
  /**
   * Get users who should receive notification for this event
   * 
   * @param event - The event to send notifications for
   * @returns Array of user preferences
   */
  private async getTargetUsers(event: Event): Promise<UserPreferences[]> {
    try {
      // If event specifies all users, query all enabled users
      if (event.targetAudience?.allUsers) {
        // TODO: Implement pagination for large user bases
        console.warn('[NotificationEngine] All-users targeting not yet implemented');
        return [];
      }
      
      // If event specifies specific users
      if (event.targetAudience?.userIds && event.targetAudience.userIds.length > 0) {
        const users: UserPreferences[] = [];
        for (const userId of event.targetAudience.userIds) {
          const prefs = await userPreferencesRepository.getPreferences(userId);
          if (prefs) {
            users.push(prefs);
          }
        }
        return users;
      }
      
      // If event specifies teams, get users subscribed to those teams
      if (event.targetAudience?.teams && event.targetAudience.teams.length > 0) {
        const allUsers: UserPreferences[] = [];
        
        for (const teamId of event.targetAudience.teams) {
          const teamUsers = await userPreferencesRepository.getUsersByTeam(teamId);
          allUsers.push(...teamUsers);
        }
        
        // Deduplicate users
        const uniqueUsers = this.deduplicateUsers(allUsers);
        
        // Filter users based on their preferences
        const sport = event.sport as any; // Cast to avoid type issues
        const eventType = event.type;
        
        const filteredUsers = uniqueUsers.filter((user) => 
          shouldNotifyUser(user, sport, eventType, event.targetAudience?.teams)
        );
        
        return filteredUsers;
      }
      
      // No targeting specified
      console.warn(`[NotificationEngine] Event ${event.id} has no target audience specified`);
      return [];
    } catch (error) {
      console.error('[NotificationEngine] Error getting target users:', error);
      throw error;
    }
  }
  
  /**
   * Deduplicate users by userId
   */
  private deduplicateUsers(users: UserPreferences[]): UserPreferences[] {
    const seen = new Set<string>();
    const unique: UserPreferences[] = [];
    
    for (const user of users) {
      if (!seen.has(user.userId)) {
        seen.add(user.userId);
        unique.push(user);
      }
    }
    
    return unique;
  }
  
  /**
   * Process a single game update
   * 
   * This is the main entry point called by polling jobs
   * 
   * @param oldGame - Previous game state (null if first time)
   * @param newGame - Current game state
   * @param provider - Sport provider to use for event detection
   */
  async processGameUpdate(
    oldGame: Game | null,
    newGame: Game,
    provider: any // SportProvider type
  ): Promise<number> {
    try {
      console.log(`[NotificationEngine] Processing game update for ${newGame.id}`);
      
      // Detect events
      const events = provider.detectEvents(oldGame, newGame);
      
      if (events.length === 0) {
        console.log(`[NotificationEngine] No events detected for game ${newGame.id}`);
        return 0;
      }
      
      console.log(`[NotificationEngine] Detected ${events.length} events for game ${newGame.id}`);
      
      // Process events
      const notificationsSent = await this.processEvents(events);
      
      return notificationsSent;
    } catch (error) {
      console.error(`[NotificationEngine] Error processing game update:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const notificationEngine = new NotificationEngine();
