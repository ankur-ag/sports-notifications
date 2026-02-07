/**
 * Template engine for processing notification messages.
 */

import { Event } from '../models/Event';
import { Game } from '../models/Game';

export class TemplateEngine {
    /**
     * Render a template string with data from event and game.
     * 
     * Supported placeholders:
     * - {{homeTeam}}
     * - {{awayTeam}}
     * - {{homeScore}}
     * - {{awayScore}}
     * - {{homeRecord}}
     * - {{awayRecord}}
     * - {{period}}
     * - {{clock}}
     * - {{differential}} (if available in metadata)
     * - {{leadingTeam}} (if available in metadata)
     */
    render(template: string, event: Event, game?: Game): string {
        let result = template;

        // Helper to replace all occurrences
        const replace = (key: string, value: string | number | undefined) => {
            if (value === undefined || value === null) return;
            // Global regex replacement
            const regex = new RegExp(`{{${key}}}`, 'g');
            result = result.replace(regex, String(value));
        };

        // Replace event-specific data
        if (event.metadata) {
            Object.keys(event.metadata).forEach(key => {
                replace(key, event.metadata![key]);
            });

            // Handle nested score object in metadata if present
            if (event.metadata.score) {
                replace('homeScore', event.metadata.score.home);
                replace('awayScore', event.metadata.score.away);
            }

            if (event.metadata.finalScore) {
                replace('homeScore', event.metadata.finalScore.home);
                replace('awayScore', event.metadata.finalScore.away);
            }
        }

        // Replace game data if available
        if (game) {
            replace('homeTeam', game.homeTeam);
            replace('awayTeam', game.awayTeam);
            replace('homeAbbr', game.homeAbbr);
            replace('awayAbbr', game.awayAbbr);
            replace('homeScore', game.homeScore);
            replace('awayScore', game.awayScore);
            replace('homeRecord', game.homeRecord);
            replace('awayRecord', game.awayRecord);
            replace('period', game.period);
            replace('clock', game.clock);
            replace('status', game.statusDetail);
        }

        return result;
    }
}

export const templateEngine = new TemplateEngine();
