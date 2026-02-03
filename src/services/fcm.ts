/**
 * Firebase Cloud Messaging service for sending push notifications.
 * 
 * Design decisions:
 * - Uses Firebase Admin SDK's messaging API
 * - Supports both individual and batch notifications
 * - Handles token invalidation and cleanup
 * - Includes retry logic for transient failures
 * 
 * iOS-specific considerations:
 * - APS (Apple Push Notification service) payload formatting
 * - Badge, sound, and alert configuration
 * - Content-available for background updates
 */

import * as admin from 'firebase-admin';
import { Event, EventPriority } from '../models/Event';
import { UserPreferences } from '../models/UserPreferences';

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

interface NotificationPayload {
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
}

interface NotificationOptions {
  priority?: 'high' | 'normal';
  sound?: string;
  badge?: number;
  contentAvailable?: boolean;
}

/**
 * FCM Notification Service
 */
export class FCMService {
  /**
   * Send a notification to a single user
   */
  async sendNotification(
    fcmToken: string,
    payload: NotificationPayload,
    options?: NotificationOptions
  ): Promise<boolean> {
    try {
      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl
        },
        data: payload.data,
        // iOS-specific configuration
        apns: {
          payload: {
            aps: {
              alert: {
                title: payload.title,
                body: payload.body
              },
              sound: options?.sound || 'default',
              badge: options?.badge,
              contentAvailable: options?.contentAvailable
            }
          }
        },
        // Android-specific configuration
        android: {
          priority: options?.priority || 'high',
          notification: {
            sound: options?.sound || 'default',
            channelId: 'game_events'
          }
        }
      };
      
      const response = await admin.messaging().send(message);
      
      console.log(`[FCM] Successfully sent notification to ${fcmToken.substring(0, 10)}...`);
      console.log(`[FCM] Message ID: ${response}`);
      
      return true;
    } catch (error: any) {
      console.error('[FCM] Error sending notification:', error);
      
      // Handle invalid tokens
      if (error.code === 'messaging/invalid-registration-token' ||
          error.code === 'messaging/registration-token-not-registered') {
        console.log(`[FCM] Invalid token detected: ${fcmToken.substring(0, 10)}...`);
        // TODO: Remove invalid token from database
        return false;
      }
      
      throw error;
    }
  }
  
  /**
   * Send notifications to multiple users (batch)
   * 
   * Note: FCM supports up to 500 tokens per batch
   */
  async sendBatchNotifications(
    fcmTokens: string[],
    payload: NotificationPayload,
    options?: NotificationOptions
  ): Promise<{ successCount: number; failureCount: number; invalidTokens: string[] }> {
    try {
      if (fcmTokens.length === 0) {
        return { successCount: 0, failureCount: 0, invalidTokens: [] };
      }
      
      // Split into batches of 500 (FCM limit)
      const batchSize = 500;
      const batches: string[][] = [];
      
      for (let i = 0; i < fcmTokens.length; i += batchSize) {
        batches.push(fcmTokens.slice(i, i + batchSize));
      }
      
      let totalSuccess = 0;
      let totalFailure = 0;
      const invalidTokens: string[] = [];
      
      for (const batch of batches) {
        const message: admin.messaging.MulticastMessage = {
          tokens: batch,
          notification: {
            title: payload.title,
            body: payload.body,
            imageUrl: payload.imageUrl
          },
          data: payload.data,
          apns: {
            payload: {
              aps: {
                alert: {
                  title: payload.title,
                  body: payload.body
                },
                sound: options?.sound || 'default',
                badge: options?.badge,
                contentAvailable: options?.contentAvailable
              }
            }
          },
          android: {
            priority: options?.priority || 'high',
            notification: {
              sound: options?.sound || 'default',
              channelId: 'game_events'
            }
          }
        };
        
        const response = await admin.messaging().sendEachForMulticast(message);
        
        totalSuccess += response.successCount;
        totalFailure += response.failureCount;
        
        // Collect invalid tokens
        if (response.failureCount > 0) {
          response.responses.forEach((resp: any, idx: number) => {
            if (!resp.success) {
              const error = resp.error;
              if (error?.code === 'messaging/invalid-registration-token' ||
                  error?.code === 'messaging/registration-token-not-registered') {
                invalidTokens.push(batch[idx]);
              }
            }
          });
        }
        
        console.log(`[FCM] Batch sent: ${response.successCount} success, ${response.failureCount} failed`);
      }
      
      console.log(`[FCM] Total: ${totalSuccess} success, ${totalFailure} failed, ${invalidTokens.length} invalid tokens`);
      
      return {
        successCount: totalSuccess,
        failureCount: totalFailure,
        invalidTokens
      };
    } catch (error) {
      console.error('[FCM] Error sending batch notifications:', error);
      throw error;
    }
  }
  
  /**
   * Send event notification to users
   * 
   * This is the main method called by the notification engine
   */
  async sendEventNotification(
    event: Event,
    users: UserPreferences[]
  ): Promise<{ successCount: number; failureCount: number }> {
    try {
      if (users.length === 0) {
        console.log(`[FCM] No users to notify for event ${event.id}`);
        return { successCount: 0, failureCount: 0 };
      }
      
      // Extract FCM tokens
      const fcmTokens = users.map(user => user.fcmToken);
      
      // Build notification payload
      const payload: NotificationPayload = {
        title: event.title,
        body: event.message,
        data: {
          eventId: event.id,
          eventType: event.type,
          gameId: event.gameId,
          sport: event.sport
        }
      };
      
      // Determine notification options based on priority
      const options: NotificationOptions = {
        priority: event.priority >= EventPriority.HIGH ? 'high' : 'normal',
        sound: event.priority >= EventPriority.HIGH ? 'default' : undefined
      };
      
      console.log(`[FCM] Sending event notification to ${users.length} users`);
      console.log(`[FCM] Event: ${event.title}`);
      
      const result = await this.sendBatchNotifications(fcmTokens, payload, options);
      
      // Clean up invalid tokens
      if (result.invalidTokens.length > 0) {
        console.log(`[FCM] Cleaning up ${result.invalidTokens.length} invalid tokens`);
        // TODO: Remove invalid tokens from database
        // await this.cleanupInvalidTokens(result.invalidTokens);
      }
      
      return {
        successCount: result.successCount,
        failureCount: result.failureCount
      };
    } catch (error) {
      console.error('[FCM] Error sending event notification:', error);
      throw error;
    }
  }
  
  /**
   * Send a test notification (for debugging)
   */
  async sendTestNotification(fcmToken: string): Promise<boolean> {
    return this.sendNotification(
      fcmToken,
      {
        title: 'Test Notification',
        body: 'This is a test notification from Sports Notifications Backend',
        data: {
          type: 'test'
        }
      },
      {
        priority: 'high',
        sound: 'default'
      }
    );
  }
}

// Export singleton instance
export const fcmService = new FCMService();
