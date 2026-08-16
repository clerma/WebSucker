import Stripe from 'stripe';

let connectionSettings: any;

async function getCredentials() {
  // Use explicit environment variables when valid (secret key must start with sk_ or rk_).
  // NOTE: STRIPE_SECRET_KEY is managed/injected by the Replit Stripe integration and
  // cannot be overridden by the user. STRIPE_LIVE_SECRET_KEY takes precedence so the
  // user can supply their own live key. The publishable key may come from the env or
  // fall back to the Replit connector.
  const envSecret = process.env.STRIPE_LIVE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;
  const envPublishable = process.env.STRIPE_PUBLISHABLE_KEY;
  const envSecretValid = !!envSecret && (envSecret.startsWith('sk_') || envSecret.startsWith('rk_'));
  if (envSecretValid && envPublishable) {
    return {
      publishableKey: envPublishable,
      secretKey: envSecret!,
    };
  }

  // Fall back to Replit Stripe connector (sandbox/development)
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error('No Stripe credentials found. Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY, or configure the Replit Stripe connector.');
  }

  const connectorName = 'stripe';
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', connectorName);
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X-Replit-Token': xReplitToken
    }
  });

  const data = await response.json();
  connectionSettings = data.items?.[0];

  if (!connectionSettings || (!connectionSettings.settings.publishable || !connectionSettings.settings.secret)) {
    throw new Error(`Stripe ${targetEnvironment} connection not found. Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY environment variables to use live Stripe.`);
  }

  return {
    publishableKey: envPublishable || connectionSettings.settings.publishable,
    // Prefer the explicit env secret when valid; connector only fills gaps.
    secretKey: envSecretValid ? envSecret! : connectionSettings.settings.secret,
  };
}

export async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, {
    apiVersion: '2025-08-27.basil' as any,
  });
}

export async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = await getStripeSecretKey();

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
