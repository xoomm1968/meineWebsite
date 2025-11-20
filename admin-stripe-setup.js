import Stripe from 'stripe';
import 'dotenv/config'; // Lädt STRIPE_SECRET_KEY aus .env

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('Fehler: STRIPE_SECRET_KEY ist nicht gesetzt. Lege eine .env Datei mit STRIPE_SECRET_KEY=sk_... an.');
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });

// Definiere alle 6 finalen Pakete
const packagesToCreate = [
  // --- BASIS-TTS PAKETE (OpenAI / Polly) ---
  { amount: 399, quantity: 10000, type: 'Basis', name: 'Basis S (10k Zeichen)' },
  { amount: 1177, quantity: 30000, type: 'Basis', name: 'Basis Starter (30k Zeichen)' },
  { amount: 3800, quantity: 100000, type: 'Basis', name: 'Basis Pro (100k Zeichen)' },

  // --- PREMIUM-TTS PAKETE (ElevenLabs) ---
  { amount: 599, quantity: 10000, type: 'Premium', name: 'Premium S (10k Zeichen)' },
  { amount: 1599, quantity: 30000, type: 'Premium', name: 'Premium Starter (30k Zeichen)' },
  { amount: 4499, quantity: 100000, type: 'Premium', name: 'Premium Pro (100k Zeichen)' },
];

async function createStripePrices() {
  console.log('Starte Erstellung von 6 Stripe-Preis-Objekten...');

  // Optional: vordefinierte Produkt-IDs (du kannst sie anpassen oder leer lassen)
  const productIds = {
    'Basis': process.env.STRIPE_PRODUCT_BASIS || null,
    'Premium': process.env.STRIPE_PRODUCT_PREMIUM || null,
  };

  // Prüfe, ob die Produkte existieren oder erstelle neue Produkte
  for (const type of ['Basis', 'Premium']) {
    try {
      if (productIds[type]) {
        // versuche das Produkt zu holen
        await stripe.products.retrieve(productIds[type]);
        console.log(`Produkt ${productIds[type]} gefunden für Typ ${type}`);
      } else {
        throw new Error('no-id');
      }
    } catch (error) {
      if (error && error.code === 'resource_missing' || error.message === 'no-id') {
        console.log(`Produkt für ${type} fehlt oder ID nicht gesetzt, wird angelegt...`);
        const product = await stripe.products.create({
          name: `${type} TTS Zeichenkontingent`,
          description: `${type} Paket für TTS Zeichen`,
          metadata: { tts_package_type: type },
        });
        productIds[type] = product.id;
        console.log(`Erstellt Produkt ${product.id} für ${type}`);
      } else {
        console.error('Fehler beim Prüfen/Erstellen des Produkts:', error.message || error);
        throw error;
      }
    }
  }

  const createdPrices = [];

  for (const pkg of packagesToCreate) {
    try {
      const price = await stripe.prices.create({
        unit_amount: pkg.amount,
        currency: 'usd',
        product: productIds[pkg.type],
        // One-time payment -> kein recurring-Block
        nickname: pkg.name,
        metadata: {
          char_quantity: String(pkg.quantity),
          char_type: pkg.type,
        },
      });
      createdPrices.push({ name: pkg.name, id: price.id, price_usd: (pkg.amount / 100) });
      console.log(`Erstellt Price ${price.id} (${pkg.name})`);
    } catch (error) {
      console.error(`Fehler beim Erstellen von ${pkg.name}:`, error.message || error);
    }
  }

  console.log('\n✅ Erstellung abgeschlossen. Preise:');
  console.table(createdPrices);
  console.log('\nHinweis: Speichere die Price IDs und setze sie als Cloudflare-Secrets (z.B. PRICE_ID_3_20_CHF).');
}

createStripePrices().catch(err => {
  console.error('Script-Fehler:', err);
  process.exit(1);
});
