---
name: Verified-email free tier
description: Durable security and delivery constraints for gating new accounts and free scrapes on email verification.
---

Existing accounts are grandfathered as verified. Every new account must remain signed out and blocked from authenticated operations until it consumes a hashed, one-hour, single-use email-verification token.

**Why:** The free scrape is an entitlement with real cost. Signing an unverified registration in, or allowing an alternate authentication path to establish a usable unverified session, reopens multi-account abuse and bypasses the ownership proof.

**How to apply:** Any new authentication path must preserve the verification gate. Registration must roll back the account if delivery fails; resend responses must not reveal whether an account exists; verification URLs must use a trusted configured origin rather than request headers.

Resend transactional messages use the verified `noreply@websitesucker.com` sender. The connected API key is send-only and cannot enumerate domains.

**Why:** Falling back to Resend's onboarding sender can pass sink tests while refusing delivery to real customers.

**How to apply:** Do not restore runtime domain discovery or onboarding-sender fallback unless the connector permissions and production delivery behavior are deliberately changed and verified.