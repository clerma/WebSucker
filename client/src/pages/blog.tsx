import { ArrowLeft, ArrowRight, BookOpen, Clock } from "lucide-react";
import { articles } from "@/data/articles";
import { Reveal } from "@/components/reveal";
import { useSeo, SITE_URL } from "@/lib/seo";

export default function Blog() {
  useSeo({
    title: "Website Backup, Archive & Migration Guides | Website Sucker Blog",
    description:
      "Practical, step-by-step guides on backing up, archiving, transferring, and converting websites — for Squarespace, Wix, WordPress, and any platform. Free help from the Website Sucker team.",
    canonicalPath: "/blog",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "Website Sucker Help & Guides",
      url: `${SITE_URL}/blog`,
      description:
        "Guides on backing up, archiving, transferring, and converting websites on any platform.",
      blogPost: articles.map((a) => ({
        "@type": "BlogPosting",
        headline: a.title,
        description: a.metaDescription,
        url: `${SITE_URL}/blog/${a.slug}`,
        articleSection: a.category,
      })),
    },
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Website Sucker
          </a>
          <div className="flex items-center gap-3 mb-4 animate-fade-up">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 ring-1 ring-primary/20 animate-float">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-3xl font-bold">Website Help &amp; Guides</h1>
          </div>
          <p
            className="text-muted-foreground text-lg max-w-2xl animate-fade-up"
            style={{ animationDelay: "100ms" }}
          >
            Practical guides on backing up, exporting, migrating, and converting websites — whatever platform you're on.
          </p>
        </div>
      </div>

      {/* Article grid */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="grid gap-6">
          {articles.map((article, i) => (
            <Reveal key={article.slug} delay={Math.min(i * 60, 300)}>
            <a
              href={`/blog/${article.slug}`}
              className="group block border rounded-xl p-6 bg-card hover:border-primary/50 hover:shadow-md hover:-translate-y-1 transition-all duration-200"
              data-testid={`article-card-${article.slug}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      {article.category}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {article.readingTime}
                    </span>
                  </div>
                  <h2 className="text-xl font-semibold mb-2 group-hover:text-primary transition-colors">
                    {article.title}
                  </h2>
                  <p className="text-muted-foreground leading-relaxed line-clamp-2">
                    {article.intro}
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0 mt-1" />
              </div>
            </a>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Footer CTA */}
      <div className="border-t bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <h2 className="text-xl font-semibold mb-3">Ready to back up your site?</h2>
          <p className="text-muted-foreground mb-6">
            Create a free account and preview your first scrape free — ZIP downloads from $1.99 for a single credit (packs from $1.30/credit).
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors"
            data-testid="link-try-tool"
          >
            Try Website Sucker Free
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
