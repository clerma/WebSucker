import { getUncachableStripeClient } from './stripeClient';

// One-off: create credit-pack prices on the existing WebSucker product.
async function createCreditPacks() {
  const stripe = await getUncachableStripeClient();

  const existing = await stripe.products.search({ query: "name:'WebSucker'" });
  const product = existing.data[0];
  if (!product) {
    console.error('WebSucker product not found — run seed-products first.');
    process.exit(1);
  }

  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  const packs = [
    { credits: 1, amount: 199 },
    { credits: 3, amount: 499 },
    { credits: 10, amount: 1299 },
  ];

  for (const pack of packs) {
    const already = prices.data.find(
      (p) => p.metadata?.type === 'credits' && p.metadata?.credits === String(pack.credits)
    );
    if (already) {
      console.log(`Pack of ${pack.credits} already exists: ${already.id}`);
      continue;
    }
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: pack.amount,
      currency: 'usd',
      nickname: `${pack.credits} credits`,
      metadata: { type: 'credits', credits: String(pack.credits) },
    });
    console.log(`Created ${pack.credits}-credit pack ($${pack.amount / 100}): ${price.id}`);
  }
}

createCreditPacks().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
