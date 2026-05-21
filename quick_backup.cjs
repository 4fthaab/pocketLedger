const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

// Initialize admin SDK using your certificate file
const serviceAccount = require('./cred.json');
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function exportUser() {
    console.log("🚀 Connecting to Firestore...");
    const userId = "userid";
    // 1. Fetch Root Document (Changed .document() to .doc())
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        console.error("❌ User document not found!");
        return;
    }

    let resultData = { uid: userDoc.id, ...userDoc.data() };

    // 2. Map the subcollections (Changed .document() to .doc())
    const subcollections = ['balances', 'categories', 'goals','liabalities', 'people','transactions'];
    for (const sub of subcollections) {
        console.log(`📦 Fetching subcollection: ${sub}...`);
        resultData[sub] = {};
        const snapshot = await db.collection('users').doc(userId).collection(sub).get();
        snapshot.forEach(doc => {
            resultData[sub][doc.id] = doc.data();
        });
    }

    // 3. Write formatted JSON directly to disk
    fs.writeFileSync('./backup.json', JSON.stringify(resultData, null, 2));
    console.log("✅ Success! 'backup.json' has been created in your root folder.");
}

exportUser().catch(err => console.error("❌ Unexpected Error:", err));