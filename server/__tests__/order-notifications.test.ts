import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";
import { eq } from "drizzle-orm";
import express from "express";
import Stripe from "stripe";
import { adminOrderNotifications } from "../../shared/schema";
import { db } from "../db";
import {
  attemptAdminOrderNotification,
  listUnresolvedAdminOrderNotifications,
  notificationInputFromCharge,
  orderTypeFromBillingReason,
  queueAdminOrderNotification,
  retryExpiredAdminOrderNotification,
} from "../orderNotifications";
import { registerStripeWebhookRoute } from "../stripeWebhookRoute";
import { WebhookHandlers } from "../webhookHandlers";

function charge(overrides: Partial<Stripe.Charge> = {}): Stripe.Charge {
  return {
    id: "ch_test_order",
    object: "charge",
    amount: 599,
    amount_captured: 599,
    amount_refunded: 0,
    application: null,
    application_fee: null,
    application_fee_amount: null,
    balance_transaction: null,
    billing_details: {
      address: null,
      email: "buyer@example.com",
      name: "Buyer",
      phone: null,
      tax_id: null,
    },
    calculated_statement_descriptor: null,
    captured: true,
    created: 1_788_523_200,
    currency: "usd",
    customer: null,
    description: null,
    disputed: false,
    failure_balance_transaction: null,
    failure_code: null,
    failure_message: null,
    fraud_details: {},
    livemode: false,
    metadata: {},
    outcome: null,
    paid: true,
    payment_intent: "pi_test_order",
    payment_method: "pm_test_order",
    payment_method_details: null,
    radar_options: {},
    receipt_email: null,
    receipt_number: null,
    receipt_url: null,
    refunded: false,
    refunds: { object: "list", data: [], has_more: false, url: "" },
    review: null,
    shipping: null,
    source: null,
    source_transfer: null,
    statement_descriptor: null,
    statement_descriptor_suffix: null,
    status: "succeeded",
    transfer: null,
    transfer_data: null,
    transfer_group: null,
    ...overrides,
  } as Stripe.Charge;
}

test("successful non-zero charges become order notifications", () => {
  const oneTime = notificationInputFromCharge(charge({
    metadata: { app: "websucker", type: "credits" },
  }));
  assert.equal(oneTime?.orderType, "Credit pack");
  assert.equal(oneTime?.amountCents, 599);
  assert.equal(oneTime?.customerEmail, "buyer@example.com");

  const subscription = notificationInputFromCharge(charge({
    id: "ch_subscription",
    metadata: { app: "websucker", type: "subscription" },
  }));
  assert.equal(subscription?.orderType, "New subscription");
  assert.equal(subscription?.paymentIntentId, "pi_test_order");
  assert.equal(orderTypeFromBillingReason("subscription_cycle"), "Subscription renewal");
  assert.equal(orderTypeFromBillingReason("subscription_create"), "New subscription");

  assert.equal(notificationInputFromCharge(charge({ amount: 0 })), null);
  const withoutCustomer = notificationInputFromCharge(charge({
    billing_details: {
      address: null,
      email: null,
      name: null,
      phone: null,
      tax_id: null,
    },
    receipt_email: null,
  }));
  assert.equal(withoutCustomer?.customerEmail, null);
  assert.equal(withoutCustomer?.customerName, null);
});

test("delivery retries without duplicating a sent charge", async () => {
  const chargeId = `ch_test_${process.pid}_${Date.now()}`;
  const input = {
    chargeId,
    amountCents: 199,
    currency: "usd",
    customerEmail: null,
    customerName: null,
    orderType: "One-time payment",
    description: null,
    invoiceId: null,
    paymentIntentId: "pi_test",
    paidAt: new Date(),
  };
  let sends = 0;

  try {
    assert.equal(await queueAdminOrderNotification(input, async () => {
      sends += 1;
      throw new Error("temporary Resend outage");
    }), "failed");

    let [stored] = await db.select().from(adminOrderNotifications)
      .where(eq(adminOrderNotifications.stripeChargeId, chargeId));
    assert.equal(stored.attempts, 1);
    assert.equal(stored.sentAt, null);
    assert.match(stored.lastError ?? "", /temporary Resend outage/);
    assert.ok(stored.retryUntil.getTime() > Date.now() + 22 * 60 * 60_000);

    await db.update(adminOrderNotifications).set({ nextAttemptAt: new Date(0) })
      .where(eq(adminOrderNotifications.stripeChargeId, chargeId));
    assert.equal(await attemptAdminOrderNotification(chargeId, async () => {
      sends += 1;
      return "email_test";
    }), "sent");

    assert.equal(await queueAdminOrderNotification(input, async () => {
      sends += 1;
      return "should_not_send";
    }), "unavailable");
    [stored] = await db.select().from(adminOrderNotifications)
      .where(eq(adminOrderNotifications.stripeChargeId, chargeId));
    assert.equal(sends, 2);
    assert.equal(stored.attempts, 2);
    assert.ok(stored.sentAt);
    assert.equal(stored.resendEmailId, "email_test");
  } finally {
    await db.delete(adminOrderNotifications)
      .where(eq(adminOrderNotifications.stripeChargeId, chargeId));
  }
});

test("delivery never retries after Resend's idempotency guarantee", async () => {
  const chargeId = `ch_expired_retry_${process.pid}_${Date.now()}`;
  try {
    await db.insert(adminOrderNotifications).values({
      stripeChargeId: chargeId,
      amountCents: 199,
      currency: "usd",
      orderType: "One-time payment",
      paidAt: new Date(),
      nextAttemptAt: new Date(0),
      retryUntil: new Date(Date.now() - 1),
      lastError: "Delivery outcome unknown after worker interruption",
    });
    let sends = 0;
    assert.equal(await attemptAdminOrderNotification(chargeId, async () => {
      sends += 1;
      return "unsafe_duplicate";
    }), "unavailable");
    assert.equal(sends, 0);
  } finally {
    await db.delete(adminOrderNotifications)
      .where(eq(adminOrderNotifications.stripeChargeId, chargeId));
  }
});

test("expired notifications are visible and require duplicate-risk acknowledgement", async () => {
  const chargeId = `ch_manual_retry_${process.pid}_${Date.now()}`;
  try {
    await db.insert(adminOrderNotifications).values({
      stripeChargeId: chargeId,
      amountCents: 2499,
      currency: "usd",
      customerEmail: "buyer@example.com",
      orderType: "Subscription renewal",
      paidAt: new Date(),
      nextAttemptAt: new Date(0),
      retryUntil: new Date(Date.now() - 1),
      attempts: 3,
      lastError: "Delivery outcome unknown",
    });

    const unresolved = await listUnresolvedAdminOrderNotifications();
    const summary = unresolved.find(item => item.stripeChargeId === chargeId);
    assert.equal(summary?.status, "reconciliation_required");
    assert.equal(summary?.attempts, 3);
    assert.equal(summary?.lastError, "Delivery outcome unknown");

    let sends = 0;
    assert.equal(
      await retryExpiredAdminOrderNotification(chargeId, false, async () => {
        sends += 1;
        return "should_not_send";
      }),
      "acknowledgement_required",
    );
    assert.equal(sends, 0);

    assert.equal(
      await retryExpiredAdminOrderNotification(chargeId, true, async () => {
        sends += 1;
        return "email_manual_retry";
      }),
      "sent",
    );
    assert.equal(sends, 1);
  } finally {
    await db.delete(adminOrderNotifications)
      .where(eq(adminOrderNotifications.stripeChargeId, chargeId));
  }
});

test("a concurrent worker cannot send the same charge", async () => {
  const chargeId = `ch_concurrent_${process.pid}_${Date.now()}`;
  const input = {
    chargeId,
    amountCents: 1299,
    currency: "usd",
    customerEmail: "buyer@example.com",
    customerName: "Buyer",
    orderType: "Credit pack",
    description: null,
    invoiceId: null,
    paymentIntentId: null,
    paidAt: new Date(),
  };
  let sends = 0;
  let releaseSend!: () => void;
  const sending = new Promise<void>(resolve => {
    releaseSend = resolve;
  });
  let enteredSend!: () => void;
  const senderEntered = new Promise<void>(resolve => {
    enteredSend = resolve;
  });

  try {
    const first = queueAdminOrderNotification(input, async () => {
      sends += 1;
      enteredSend();
      await sending;
      return "email_concurrent";
    });
    await senderEntered;
    assert.equal(
      await queueAdminOrderNotification(input, async () => {
        sends += 1;
        return "duplicate";
      }),
      "unavailable",
    );
    releaseSend();
    assert.equal(await first, "sent");
    assert.equal(sends, 1);
  } finally {
    releaseSend?.();
    await db.delete(adminOrderNotifications)
      .where(eq(adminOrderNotifications.stripeChargeId, chargeId));
  }
});

test("Stripe v20 invoice-payment context labels renewals", async () => {
  const chargeId = `ch_renewal_${process.pid}_${Date.now()}`;
  let deliveredOrderType = "";
  let deliveredInvoiceId: string | null = null;
  try {
    assert.equal(await queueAdminOrderNotification({
      chargeId,
      amountCents: 599,
      currency: "usd",
      customerEmail: null,
      customerName: null,
      orderType: "One-time payment",
      description: null,
      invoiceId: null,
      paymentIntentId: "pi_renewal",
      paidAt: new Date(),
    }, async input => {
      deliveredOrderType = input.orderType;
      deliveredInvoiceId = input.invoiceId;
      return "email_renewal";
    }, async (paymentIntentId, invoiceId) => {
      assert.equal(paymentIntentId, "pi_renewal");
      assert.equal(invoiceId, null);
      return {
        invoiceId: "in_renewal",
        billingReason: "subscription_cycle",
        customerEmail: "subscriber@example.com",
        customerName: null,
        description: null,
      };
    }), "sent");
    assert.equal(deliveredOrderType, "Subscription renewal");
    assert.equal(deliveredInvoiceId, "in_renewal");
  } finally {
    await db.delete(adminOrderNotifications)
      .where(eq(adminOrderNotifications.stripeChargeId, chargeId));
  }
});

test("signed raw webhook fixtures create one durable notification per charge", async () => {
  const secret = "whsec_scrubbed_fixture_secret";
  const fixtureNames = [
    "charge-succeeded-one-time.json",
    "charge-succeeded-renewal.json",
  ];
  const chargeIds = ["ch_fixture_one_time", "ch_fixture_renewal"];
  const sends = new Map<string, number>();
  const stripe = new Stripe("sk_test_fixture");
  const app = express();
  registerStripeWebhookRoute(app, (payload, signature) =>
    WebhookHandlers.processWebhook(payload, signature, {
      signingSecrets: [secret],
      processSyncWebhook: async () => {},
      handleCharge: async charge => {
        const input = notificationInputFromCharge(charge);
        assert.ok(input);
        await queueAdminOrderNotification(
          input,
          async email => {
            sends.set(email.chargeId, (sends.get(email.chargeId) ?? 0) + 1);
            return `email_${email.chargeId}`;
          },
          async paymentIntentId => paymentIntentId === "pi_fixture_renewal"
            ? {
                invoiceId: "in_fixture_renewal",
                billingReason: "subscription_cycle",
                customerEmail: "scrubbed@example.invalid",
                customerName: null,
                description: null,
              }
            : null,
        );
      },
    }));
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/api/stripe/webhook`;

  try {
    for (const fixtureName of fixtureNames) {
      const payload = await readFile(
        new URL(`../__fixtures__/stripe/${fixtureName}`, import.meta.url),
      );
      const fixtureEvent = JSON.parse(payload.toString("utf8")) as Stripe.Event;
      assert.equal(fixtureEvent.api_version, Stripe.API_VERSION);
      const signature = stripe.webhooks.generateTestHeaderString({
        payload: payload.toString("utf8"),
        secret,
      });
      for (let delivery = 0; delivery < 2; delivery += 1) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "stripe-signature": signature,
          },
          body: payload,
        });
        assert.equal(response.status, 200);
      }
    }

    const malformedPayload = await readFile(
      new URL("../__fixtures__/stripe/charge-succeeded-one-time.json", import.meta.url),
    );
    const malformed = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1,v1=malformed",
      },
      body: malformedPayload,
    });
    assert.equal(malformed.status, 400);

    const stored = await db.select().from(adminOrderNotifications)
      .where(eq(adminOrderNotifications.stripeChargeId, chargeIds[0]));
    const renewal = await db.select().from(adminOrderNotifications)
      .where(eq(adminOrderNotifications.stripeChargeId, chargeIds[1]));
    assert.equal(stored.length, 1);
    assert.equal(renewal.length, 1);
    assert.equal(renewal[0].orderType, "Subscription renewal");
    assert.equal(renewal[0].invoiceId, "in_fixture_renewal");
    assert.deepEqual(Object.fromEntries(sends), {
      ch_fixture_one_time: 1,
      ch_fixture_renewal: 1,
    });
  } finally {
    server.close();
    await db.delete(adminOrderNotifications)
      .where(eq(adminOrderNotifications.stripeChargeId, chargeIds[0]));
    await db.delete(adminOrderNotifications)
      .where(eq(adminOrderNotifications.stripeChargeId, chargeIds[1]));
  }
});