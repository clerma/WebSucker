import { getUncachableStripeClient } from './stripeClient';

async function createProducts() {
  const stripe = await getUncachableStripeClient();

  const existingProducts = await stripe.products.search({ query: "name:'WebSucker'" });
  if (existingProducts.data.length > 0) {
    console.log('Products already exist:');
    for (const p of existingProducts.data) {
      console.log(`  - ${p.name} (${p.id})`);
      const prices = await stripe.prices.list({ product: p.id, active: true });
      for (const pr of prices.data) {
        console.log(`    Price: ${pr.id} - $${(pr.unit_amount || 0) / 100} ${pr.recurring ? `/${pr.recurring.interval}` : 'one-time'}`);
      }
    }
    return;
  }

  const product = await stripe.products.create({
    name: 'WebSucker',
    description: 'Download complete websites for offline viewing',
    metadata: {
      app: 'websucker',
    },
  });
  console.log(`Created product: ${product.id}`);

  const oneTimePrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 500,
    currency: 'usd',
    metadata: {
      type: 'one_time',
    },
  });
  console.log(`Created one-time price: ${oneTimePrice.id} - $5.00`);

  const monthlyPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 900,
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: {
      type: 'monthly',
    },
  });
  console.log(`Created monthly price: ${monthlyPrice.id} - $9.00/month`);

  console.log('\nDone! Products and prices created.');
}

createProducts().catch(console.error);
