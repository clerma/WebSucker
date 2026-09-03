import { eq } from "drizzle-orm";
import { db } from "./db";
import { reviewEmailRequests } from "@shared/schema";
import { scheduleReviewRequestEmail } from "./email";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function schedulePurchaseReviewRequest(input: {
  stripeSessionId: string;
  recipientEmail: string;
  purchasedAt: Date;
  baseUrl: string;
}): Promise<boolean> {
  const recipientEmail = input.recipientEmail.trim().toLowerCase();
  if (!recipientEmail) return false;

  // Resend requires a future timestamp. Webhook retries that arrive after the
  // intended delivery time are scheduled one minute ahead instead.
  const scheduledFor = new Date(Math.max(
    input.purchasedAt.getTime() + DAY_MS,
    Date.now() + 60_000,
  ));
  const [claim] = await db
    .insert(reviewEmailRequests)
    .values({
      stripeSessionId: input.stripeSessionId,
      recipientEmail,
      scheduledFor,
    })
    .onConflictDoNothing()
    .returning({ id: reviewEmailRequests.id });
  if (!claim) return false;

  try {
    const resendEmailId = await scheduleReviewRequestEmail(
      recipientEmail,
      `${input.baseUrl.replace(/\/$/, "")}/review`,
      scheduledFor,
    );
    await db
      .update(reviewEmailRequests)
      .set({ resendEmailId })
      .where(eq(reviewEmailRequests.id, claim.id));
    return true;
  } catch (error) {
    // Release the claim so Stripe's webhook retry can try scheduling again.
    await db.delete(reviewEmailRequests).where(eq(reviewEmailRequests.id, claim.id));
    throw error;
  }
}