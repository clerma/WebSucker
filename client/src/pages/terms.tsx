import { Scale, ArrowLeft } from "lucide-react";
import { useSeo } from "@/lib/seo";

export default function Terms() {
  useSeo({
    title: "Terms & Conditions | Website Sucker",
    description:
      "The terms and conditions for using Website Sucker — the online tool to back up, archive, and transfer any website. Permitted use, pricing, privacy, and your responsibilities.",
    canonicalPath: "/terms",
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="mb-10">
          <a href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
            <ArrowLeft className="h-4 w-4" />
            Back to Website Sucker
          </a>
          <div className="flex items-center gap-3 mb-4">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
              <Scale className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-3xl font-bold">Terms &amp; Conditions</h1>
          </div>
          <p className="text-muted-foreground">
            Last updated: March 2026
          </p>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">

          <section>
            <h2 className="text-xl font-semibold mb-3">1. About This Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              Website Sucker (<strong>websitesucker.com</strong>) is a web-based tool that crawls and archives website content — including HTML, CSS, JavaScript, images, and other assets — for the purposes of offline viewing, website backup, CMS migration, and site transition or conversion projects. By accessing or using this service you agree to these Terms &amp; Conditions in full. If you do not agree, do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">2. Permitted Use</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              You may use Website Sucker only for lawful purposes, including:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>Creating a personal or business backup of a website you own or have explicit permission to archive.</li>
              <li>Migrating content between CMS platforms or hosting providers.</li>
              <li>Offline review of a website for design, development, or archival purposes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">3. Your Responsibility</h2>
            <p className="text-muted-foreground leading-relaxed">
              You are solely responsible for ensuring you have the legal right to scrape, copy, or archive any website you submit to this service. It is your responsibility to comply with the target website's terms of service, robots.txt directives, applicable copyright law, and any other relevant regulations. Website Sucker is a tool — what you do with it is entirely your responsibility.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">4. No Guarantee of Results</h2>
            <p className="text-muted-foreground leading-relaxed">
              We provide this service on an <strong>"as is"</strong> and <strong>"as available"</strong> basis. We make no warranties or representations, express or implied, regarding:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground mt-3">
              <li>The completeness or accuracy of scraped content.</li>
              <li>The quality, integrity, or usability of downloaded files.</li>
              <li>Whether a scraped site will render correctly offline.</li>
              <li>Uninterrupted or error-free operation of the service.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              Some websites actively block scraping. Dynamic content, login-gated pages, and heavily JavaScript-rendered sites may not be fully captured.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">5. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              To the fullest extent permitted by applicable law, Website Sucker, its operators, and affiliates shall not be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising from your use of — or inability to use — this service. This includes but is not limited to: loss of data, loss of revenue, legal claims arising from scraped content, or any harm caused by the downloaded files.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-3">
              Your use of this service is entirely at your own risk.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">6. Prohibited Use</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              You must not use Website Sucker to:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-muted-foreground">
              <li>Scrape websites without authorisation in violation of their terms of service.</li>
              <li>Reproduce, redistribute, or commercially exploit third-party copyrighted content without permission.</li>
              <li>Conduct denial-of-service attacks or otherwise harm third-party servers.</li>
              <li>Collect personal data from third-party websites in violation of privacy laws such as GDPR or CCPA.</li>
              <li>Engage in any activity that is unlawful, harmful, or abusive.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">7. Data &amp; Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              Scraped files are stored temporarily on our servers solely for the purpose of generating your downloadable archive. Files are deleted automatically after download or after a short retention window. We do not inspect, sell, or share the content of scraped websites. For payment processing, we use Stripe — please refer to Stripe's privacy policy for details on how payment data is handled.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Payments &amp; Refunds</h2>
            <p className="text-muted-foreground leading-relaxed">
              One-time download purchases and monthly subscriptions are processed securely via Stripe. Due to the immediate digital nature of the service, we do not offer refunds once a scrape job has been initiated and a download has been authorised. Monthly subscriptions can be cancelled at any time; cancellation takes effect at the end of the current billing period.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">9. Modifications to the Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify, suspend, or discontinue the service at any time without notice. We may also update these Terms &amp; Conditions at any time. Continued use of the service after any changes constitutes your acceptance of the revised terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">10. Governing Law</h2>
            <p className="text-muted-foreground leading-relaxed">
              These Terms &amp; Conditions are governed by and construed in accordance with applicable law. Any disputes arising in connection with these terms shall be subject to the exclusive jurisdiction of the relevant courts.
            </p>
          </section>

          <section className="border-t pt-8">
            <p className="text-sm text-muted-foreground">
              If you have any questions about these terms, please email us at hello@websitesucker.com before using the service. By using Website Sucker, you confirm that you have read, understood, and agree to these Terms &amp; Conditions.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
