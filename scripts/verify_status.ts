
import * as admin from 'firebase-admin';

// Initialize Firebase Admin (uses default credentials)
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function verifySystemStatus() {
    console.log('🔍 Verifying Sports Notifications System Status...\n');

    try {
        // 1. Check Games Collection
        console.log('🏀 Checking Games...');
        const today = new Date();
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);

        const gamesSnapshot = await db.collection('games')
            .where('scheduledTime', '>=', startOfDay)
            .where('scheduledTime', '<=', endOfDay)
            .get();

        console.log(`   Found ${gamesSnapshot.size} games scheduled for today (${today.toDateString()}).`);

        if (gamesSnapshot.size > 0) {
            gamesSnapshot.forEach(doc => {
                const game = doc.data();
                const scheduledTime = game.scheduledTime.toDate().toLocaleTimeString();
                console.log(`   - [${game.status}] ${game.homeTeam.name} vs ${game.awayTeam.name} @ ${scheduledTime}`);
                if (game.status === 'LIVE' || game.status === 'FINAL') {
                    console.log(`     Score: ${game.homeTeam.score} - ${game.awayTeam.score}`);
                    console.log(`     Last Updated: ${game.lastUpdated.toDate().toLocaleString()}`);
                }
            });
        } else {
            console.log('   ⚠️ No games found for today. This might be correct if no games are scheduled, or the fetch job failed.');

            // Check for any games recently
            console.log('   Checking for ANY recent games...');
            const anyGames = await db.collection('games').orderBy('scheduledTime', 'desc').limit(5).get();
            if (anyGames.empty) {
                console.log('   ❌ No games found in database at all! Fetch job is likely broken.');
            } else {
                console.log('   Recent games found (verifying DB connection works):');
                anyGames.forEach(doc => {
                    const g = doc.data();
                    console.log(`   - ${g.scheduledTime.toDate().toDateString()}: ${g.homeTeam.code} vs ${g.awayTeam.code} (${g.status})`);
                });
            }
        }
        console.log('');

        // 2. Check Events Collection
        console.log('🔔 Checking Recent Events...');
        const eventsSnapshot = await db.collection('events')
            .orderBy('detectedAt', 'desc')
            .limit(10)
            .get();

        if (eventsSnapshot.empty) {
            console.log('   ⚠️ No events found. This is normal if games haven\'t been LIVE yet.');
        } else {
            console.log(`   Found ${eventsSnapshot.size} recent events:`);
            eventsSnapshot.forEach(doc => {
                const event = doc.data();
                console.log(`   - [${event.type}] ${event.gameId} at ${event.detectedAt.toDate().toLocaleString()}`);
                console.log(`     "${event.description}" (Notified: ${event.notified})`);
            });
        }
        console.log('');

        // 3. User Preferences
        console.log('👤 Checking User Preferences...');
        const usersSnapshot = await db.collection('userPreferences').limit(5).get();
        console.log(`   Found ${usersSnapshot.size} user preference docs (showing max 5).`);

    } catch (error) {
        console.error('❌ Error verifying status:', error);
        console.log('\nPossible fixes:');
        console.log('1. Ensure you are authenticated: `gcloud auth application-default login`');
        console.log('2. Ensure your Firebase project is selected: `firebase use default`');
    }
}

verifySystemStatus().then(() => process.exit(0)).catch(() => process.exit(1));
