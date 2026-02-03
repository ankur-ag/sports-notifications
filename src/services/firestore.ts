/**
 * Firestore service for managing games, events, and user preferences.
 * 
 * Collection structure:
 * /games/{gameId} - Individual game documents
 * /events/{eventId} - Individual event documents
 * /users/{userId}/preferences - User notification preferences
 * 
 * Design decisions:
 * - Denormalized for read performance (games and events separate)
 * - Indexed on status and scheduledTime for efficient queries
 * - Events stored separately for audit trail and analytics
 */

import * as admin from 'firebase-admin';
import {Game, GameStatus} from '../models/Game';
import {Event} from '../models/Event';
import {UserPreferences} from '../models/UserPreferences';

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Collection references
const GAMES_COLLECTION = 'games';
const EVENTS_COLLECTION = 'events';
const USERS_COLLECTION = 'users';
const PREFERENCES_SUBCOLLECTION = 'preferences';

/**
 * Game repository
 */
export class GameRepository {
  /**
   * Save or update a game
   */
  async saveGame(game: Game): Promise<void> {
    try {
      const gameRef = db.collection(GAMES_COLLECTION).doc(game.id);
      
      // Convert Date objects to Firestore Timestamps
      const gameData = {
        ...game,
        scheduledTime: admin.firestore.Timestamp.fromDate(game.scheduledTime),
        lastUpdated: admin.firestore.Timestamp.fromDate(game.lastUpdated)
      };
      
      await gameRef.set(gameData, {merge: true});
      
      console.log(`[Firestore] Saved game ${game.id}`);
    } catch (error) {
      console.error(`[Firestore] Error saving game ${game.id}:`, error);
      throw error;
    }
  }
  
  /**
   * Get a specific game by ID
   */
  async getGame(gameId: string): Promise<Game | null> {
    try {
      const gameDoc = await db.collection(GAMES_COLLECTION).doc(gameId).get();
      
      if (!gameDoc.exists) {
        return null;
      }
      
      const data = gameDoc.data()!;
      
      // Convert Firestore Timestamps back to Date objects
      return {
        ...data,
        scheduledTime: data.scheduledTime.toDate(),
        lastUpdated: data.lastUpdated.toDate()
      } as Game;
    } catch (error) {
      console.error(`[Firestore] Error getting game ${gameId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get all games for a specific date
   */
  async getGamesByDate(date: Date): Promise<Game[]> {
    try {
      // Query for games scheduled on the given date
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      const snapshot = await db.collection(GAMES_COLLECTION)
        .where('scheduledTime', '>=', admin.firestore.Timestamp.fromDate(startOfDay))
        .where('scheduledTime', '<=', admin.firestore.Timestamp.fromDate(endOfDay))
        .get();
      
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          scheduledTime: data.scheduledTime.toDate(),
          lastUpdated: data.lastUpdated.toDate()
        } as Game;
      });
    } catch (error) {
      console.error('[Firestore] Error getting games by date:', error);
      throw error;
    }
  }
  
  /**
   * Get all live games
   */
  async getLiveGames(): Promise<Game[]> {
    try {
      const snapshot = await db.collection(GAMES_COLLECTION)
        .where('status', '==', GameStatus.LIVE)
        .get();
      
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          scheduledTime: data.scheduledTime.toDate(),
          lastUpdated: data.lastUpdated.toDate()
        } as Game;
      });
    } catch (error) {
      console.error('[Firestore] Error getting live games:', error);
      throw error;
    }
  }
  
  /**
   * Batch save multiple games (more efficient)
   */
  async saveGames(games: Game[]): Promise<void> {
    try {
      console.log(`[Firestore] Starting batch save of ${games.length} games to collection: ${GAMES_COLLECTION}`);
      
      const batch = db.batch();
      
      for (const game of games) {
        const gameRef = db.collection(GAMES_COLLECTION).doc(game.id);
        const gameData = {
          ...game,
          scheduledTime: admin.firestore.Timestamp.fromDate(game.scheduledTime),
          lastUpdated: admin.firestore.Timestamp.fromDate(game.lastUpdated)
        };
        batch.set(gameRef, gameData, {merge: true});
      }
      
      await batch.commit();
      
      console.log(`[Firestore] ✓ Batch saved ${games.length} games successfully`);
    } catch (error) {
      console.error('[Firestore] Error batch saving games:', error);
      throw error;
    }
  }
}

/**
 * Event repository
 */
export class EventRepository {
  /**
   * Save an event
   */
  async saveEvent(event: Event): Promise<void> {
    try {
      const eventRef = db.collection(EVENTS_COLLECTION).doc(event.id);
      
      const eventData = {
        ...event,
        detectedAt: admin.firestore.Timestamp.fromDate(event.detectedAt),
        occurredAt: event.occurredAt ? admin.firestore.Timestamp.fromDate(event.occurredAt) : null,
        notifiedAt: event.notifiedAt ? admin.firestore.Timestamp.fromDate(event.notifiedAt) : null
      };
      
      await eventRef.set(eventData, {merge: true});
      
      console.log(`[Firestore] Saved event ${event.id}`);
    } catch (error) {
      console.error(`[Firestore] Error saving event ${event.id}:`, error);
      throw error;
    }
  }
  
  /**
   * Get an event by ID
   */
  async getEvent(eventId: string): Promise<Event | null> {
    try {
      const eventDoc = await db.collection(EVENTS_COLLECTION).doc(eventId).get();
      
      if (!eventDoc.exists) {
        return null;
      }
      
      const data = eventDoc.data()!;
      return {
        ...data,
        detectedAt: data.detectedAt.toDate(),
        occurredAt: data.occurredAt?.toDate(),
        notifiedAt: data.notifiedAt?.toDate()
      } as Event;
    } catch (error) {
      console.error(`[Firestore] Error getting event ${eventId}:`, error);
      throw error;
    }
  }
  
  /**
   * Mark event as notified
   */
  async markEventNotified(eventId: string): Promise<void> {
    try {
      const eventRef = db.collection(EVENTS_COLLECTION).doc(eventId);
      await eventRef.update({
        notified: true,
        notifiedAt: admin.firestore.Timestamp.now()
      });
      
      console.log(`[Firestore] Marked event ${eventId} as notified`);
    } catch (error) {
      console.error(`[Firestore] Error marking event as notified:`, error);
      throw error;
    }
  }
  
  /**
   * Batch save multiple events
   */
  async saveEvents(events: Event[]): Promise<void> {
    try {
      const batch = db.batch();
      
      for (const event of events) {
        const eventRef = db.collection(EVENTS_COLLECTION).doc(event.id);
        const eventData = {
          ...event,
          detectedAt: admin.firestore.Timestamp.fromDate(event.detectedAt),
          occurredAt: event.occurredAt ? admin.firestore.Timestamp.fromDate(event.occurredAt) : null,
          notifiedAt: event.notifiedAt ? admin.firestore.Timestamp.fromDate(event.notifiedAt) : null
        };
        batch.set(eventRef, eventData, {merge: true});
      }
      
      await batch.commit();
      
      console.log(`[Firestore] Batch saved ${events.length} events`);
    } catch (error) {
      console.error('[Firestore] Error batch saving events:', error);
      throw error;
    }
  }
}

/**
 * User preferences repository
 */
export class UserPreferencesRepository {
  /**
   * Save or update user preferences
   */
  async savePreferences(preferences: UserPreferences): Promise<void> {
    try {
      const prefsRef = db.collection(USERS_COLLECTION)
        .doc(preferences.userId)
        .collection(PREFERENCES_SUBCOLLECTION)
        .doc('notifications');
      
      const prefsData = {
        ...preferences,
        lastActive: preferences.lastActive ? admin.firestore.Timestamp.fromDate(preferences.lastActive) : null,
        subscriptionExpiry: preferences.subscriptionExpiry ? admin.firestore.Timestamp.fromDate(preferences.subscriptionExpiry) : null,
        createdAt: admin.firestore.Timestamp.fromDate(preferences.createdAt),
        updatedAt: admin.firestore.Timestamp.fromDate(preferences.updatedAt)
      };
      
      await prefsRef.set(prefsData, {merge: true});
      
      console.log(`[Firestore] Saved preferences for user ${preferences.userId}`);
    } catch (error) {
      console.error(`[Firestore] Error saving preferences:`, error);
      throw error;
    }
  }
  
  /**
   * Get user preferences
   */
  async getPreferences(userId: string): Promise<UserPreferences | null> {
    try {
      const prefsDoc = await db.collection(USERS_COLLECTION)
        .doc(userId)
        .collection(PREFERENCES_SUBCOLLECTION)
        .doc('notifications')
        .get();
      
      if (!prefsDoc.exists) {
        return null;
      }
      
      const data = prefsDoc.data()!;
      return {
        ...data,
        lastActive: data.lastActive?.toDate(),
        subscriptionExpiry: data.subscriptionExpiry?.toDate(),
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate()
      } as UserPreferences;
    } catch (error) {
      console.error(`[Firestore] Error getting preferences:`, error);
      throw error;
    }
  }
  
  /**
   * Get all users subscribed to a specific sport
   */
  async getUsersByTeam(teamId: string): Promise<UserPreferences[]> {
    try {
      // Note: This requires a composite index in Firestore
      // For production, consider maintaining a separate collection for team subscriptions
      const snapshot = await db.collectionGroup(PREFERENCES_SUBCOLLECTION)
        .where('enabled', '==', true)
        .get();
      
      // Filter in-memory (not efficient for large datasets)
      // TODO: Optimize with dedicated team subscriptions collection
      const users = snapshot.docs
        .map((doc) => {
          const data = doc.data();
          return {
            ...data,
            lastActive: data.lastActive?.toDate(),
            subscriptionExpiry: data.subscriptionExpiry?.toDate(),
            createdAt: data.createdAt.toDate(),
            updatedAt: data.updatedAt.toDate()
          } as UserPreferences;
        })
        .filter((prefs) => {
          // Check if user is subscribed to any sport with this team
          return Object.values(prefs.sports).some((sportPrefs) => 
            sportPrefs?.teams?.includes(teamId)
          );
        });
      
      return users;
    } catch (error) {
      console.error('[Firestore] Error getting users by team:', error);
      throw error;
    }
  }
}

// Export singleton instances
export const gameRepository = new GameRepository();
export const eventRepository = new EventRepository();
export const userPreferencesRepository = new UserPreferencesRepository();
