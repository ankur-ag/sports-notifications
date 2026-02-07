/**
 * Seed script to populate Firestore with notification templates.
 */

import * as admin from 'firebase-admin';
// import { notificationTemplateRepository } from '../services/firestore'; // Moved to lazy load
import { EventType } from '../models/Event';
import { NotificationTemplate } from '../models/NotificationTemplate';

// Ensure Firebase is initialized
import * as fs from 'fs';
import * as path from 'path';

// Ensure Firebase is initialized
if (!admin.apps.length) {
    // Check for service account key or use default credential
    try {
        let serviceAccountPath;
        // Search in possible locations
        const possiblePaths = [
            path.join(__dirname, '../../serviceAccountKey.json'), // Project root (compiled)
            path.join(__dirname, '../../../serviceAccountKey.json') // Parent directory
        ];

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                serviceAccountPath = p;
                console.log(`Found service account key at: ${p}`);
                break;
            }
        }

        if (serviceAccountPath) {
            const serviceAccount = require(serviceAccountPath);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } else {
            throw new Error('Service account key not found');
        }
    } catch (e) {
        console.log('Service account key not found, attempting default initialization...');

        // Try to get project ID from .firebaserc
        let projectId;
        try {
            const firebasercPath = path.join(__dirname, '../../.firebaserc');
            if (fs.existsSync(firebasercPath)) {
                const firebasercContent = fs.readFileSync(firebasercPath, 'utf8');
                const firebaserc = JSON.parse(firebasercContent);
                projectId = firebaserc?.projects?.default;
            }
        } catch (error) {
            console.warn('Could not read .firebaserc', error);
        }

        if (projectId) {
            console.log(`Using project ID from .firebaserc: ${projectId}`);
            admin.initializeApp({ projectId });
        } else {
            console.log('No project ID found, relying on environment variables...');
            admin.initializeApp();
        }
    }
}

const templates: NotificationTemplate[] = [
    // GAME_START Templates
    {
        id: 'game_start_generic_1',
        type: EventType.GAME_START,
        sport: 'ALL',
        titleTemplate: 'Game On!',
        bodyTemplate: '{{awayTeam}} @ {{homeTeam}} is starting now!',
        priority: 1
    },
    {
        id: 'game_start_nba_1',
        type: EventType.GAME_START,
        sport: 'NBA',
        titleTemplate: 'Tip-off Time! 🏀',
        bodyTemplate: '{{awayTeam}} takes on {{homeTeam}}. Who holds the court?',
        priority: 2
    },
    {
        id: 'game_start_nba_2',
        type: EventType.GAME_START,
        sport: 'NBA',
        titleTemplate: 'Ball is Up!',
        bodyTemplate: '{{awayTeam}} vs {{homeTeam}} is live!',
        priority: 1
    },

    // GAME_END Templates
    {
        id: 'game_end_generic_1',
        type: EventType.GAME_END,
        sport: 'ALL',
        titleTemplate: 'Final Score',
        bodyTemplate: '{{awayTeam}} {{awayScore}} - {{homeTeam}} {{homeScore}}',
        priority: 1
    },
    {
        id: 'game_end_nba_1',
        type: EventType.GAME_END,
        sport: 'NBA',
        titleTemplate: 'Buzzer Beater? 🚨',
        bodyTemplate: 'It\'s over in {{homeTeam}}! Final: {{awayAbbr}} {{awayScore}} - {{homeAbbr}} {{homeScore}}',
        priority: 2
    },
    {
        id: 'game_end_nba_thriller',
        type: EventType.GAME_END,
        sport: 'NBA',
        titleTemplate: 'What a Game! 🔥',
        bodyTemplate: '{{awayTeam}} {{awayScore}} - {{homeTeam}} {{homeScore}}. Check the highlights!',
        priority: 1
    },

    // CLOSE_GAME Templates
    {
        id: 'close_game_generic_1',
        type: EventType.CLOSE_GAME,
        sport: 'ALL',
        titleTemplate: 'Nail Biter! 💅',
        bodyTemplate: 'Only {{differential}} points difference between {{awayAbbr}} and {{homeAbbr}}!',
        priority: 1
    },
    {
        id: 'close_game_nba_1',
        type: EventType.CLOSE_GAME,
        sport: 'NBA',
        titleTemplate: 'Crunch Time! ⏱️',
        bodyTemplate: '{{clock}} left in the 4th! score is {{awayScore}}-{{homeScore}}.',
        priority: 2
    },

    // BLOWOUT Templates
    {
        id: 'blowout_generic_1',
        type: EventType.BLOWOUT,
        sport: 'ALL',
        titleTemplate: 'It\'s a Rout!',
        bodyTemplate: '{{leadingTeam}} is up by {{differential}}!',
        priority: 1
    },

    // OVERTIME Templates
    {
        id: 'overtime_nba_1',
        type: EventType.OVERTIME,
        sport: 'NBA',
        titleTemplate: 'Free Basketball! 🆓',
        bodyTemplate: '{{awayAbbr}} and {{homeAbbr}} are heading to OT tied at {{homeScore}}!',
        priority: 2
    }
];

async function seed() {
    console.log('Starting seed script (v2 with local key support)...');
    console.log(`Current directory: ${process.cwd()}`);
    console.log('Seeding notification templates...');

    // Lazy load firestore service after initialization
    const { notificationTemplateRepository } = require('../services/firestore');

    for (const template of templates) {
        await notificationTemplateRepository.saveTemplate(template);
    }

    console.log('Seeding complete!');
    process.exit(0);
}

seed().catch((error) => {
    if (error.message && error.message.includes('Could not load the default credentials')) {
        console.error('\n\x1b[31mError: Firebase authentication failed.\x1b[0m');
        console.error('To fix this, please run:');
        console.error('  \x1b[36mgcloud auth application-default login\x1b[0m');
        console.error('\nOr ensures GOOGLE_APPLICATION_CREDENTIALS points to a valid service account key.');
    } else {
        console.error(error);
    }
    process.exit(1);
});
