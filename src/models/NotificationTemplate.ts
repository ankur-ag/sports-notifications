/**
 * Notification template model for dynamic notifications.
 * 
 * Design:
 * - Stored in Firestore
 * - Supports placeholders (e.g., {{homeTeam}})
 * - Filterable by sport and event type
 */

import { EventType } from './Event';

export interface NotificationTemplate {
    id: string; // Unique ID
    type: EventType; // The event this template applies to
    sport: string; // 'ALL' or specific sport (e.g., 'NBA')
    titleTemplate: string; // e.g., "Game Time!"
    bodyTemplate: string; // e.g., "{{awayTeam}} @ {{homeTeam}} just started!"
    priority?: number; // Higher priority templates selected more often? (optional)
    tags?: string[]; // e.g., "funny", "serious"
}
