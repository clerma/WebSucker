import { ArrowLeft, ArrowRight, Clock, Tag } from "lucide-react";
import { useParams } from "wouter";
import { articles } from "@/data/articles";

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const article = articles.find((a) => a.slug === slug);

  if (!article) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-semibold mb-3">Article not found</h1>
          <a href="/blog" className="text-primary hover:underline">
            Back to all articles
          </a>
        </div>
      </div>
    );
  }

  // Adjacent articles for prev/next navigation
  const currentIndex = articles.findIndex((a) => a.slug === slug);
  const prevArticle = currentIndex > 0 ? articles[currentIndex - 1] : null;
  const nextArticle =
    currentIndex < articles.length - 1 ? articles[currentIndex + 1] : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <div className="border-b">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <a
            href="/blog"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="link-back-to-blog"
          >
            <ArrowLeft className="h-4 w-4" />
            All Articles
          </a>
        </div>
      </div>

      {/* Article */}
      <article className="max-w-3xl mx-auto px-4 py-12">
        {/* Meta */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
              <Tag className="h-3 w-3" />
              {article.category}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {article.readingTime}
            </span>
            <span className="text-xs text-muted-foreground">
              {article.publishedDate}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4">
            {article.title}
          </h1>

          <p className="text-lg text-muted-foreground leading-relaxed border-l-4 border-primary/30 pl-4">
            {article.intro}
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-10">
          {article.sections.map((section, i) => (
            <section key={i}>
              <h2 className="text-xl font-semibold mb-3">{section.heading}</h2>
              {section.body.map((para, j) => (
                <p key={j} className="text-muted-foreground leading-relaxed mb-3">
                  {para}
                </p>
              ))}
              {section.list && (
                <ul className="mt-3 space-y-2 pl-5 list-disc">
                  {section.list.map((item, k) => (
                    <li key={k} className="text-muted-foreground leading-relaxed">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        {/* CTA box */}
        <div className="mt-14 rounded-xl border bg-muted/40 p-8 text-center">
          <h2 className="text-xl font-semibold mb-2">{article.cta.heading}</h2>
          <p className="text-muted-foreground mb-6">{article.cta.body}</p>
          <a
            href="/"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors"
            data-testid="link-try-tool-cta"
          >
            Try Website Sucker Free
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        {/* Prev / Next */}
        {(prevArticle || nextArticle) && (
          <nav className="mt-12 pt-8 border-t grid grid-cols-1 sm:grid-cols-2 gap-4">
            {prevArticle ? (
              <a
                href={`/blog/${prevArticle.slug}`}
                className="group flex flex-col gap-1 p-4 rounded-lg border hover:border-primary/50 transition-colors"
                data-testid="link-prev-article"
              >
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ArrowLeft className="h-3 w-3" /> Previous
                </span>
                <span className="font-medium group-hover:text-primary transition-colors line-clamp-2">
                  {prevArticle.title}
                </span>
              </a>
            ) : (
              <div />
            )}
            {nextArticle ? (
              <a
                href={`/blog/${nextArticle.slug}`}
                className="group flex flex-col gap-1 p-4 rounded-lg border hover:border-primary/50 transition-colors sm:text-right"
                data-testid="link-next-article"
              >
                <span className="flex items-center gap-1 text-xs text-muted-foreground sm:justify-end">
                  Next <ArrowRight className="h-3 w-3" />
                </span>
                <span className="font-medium group-hover:text-primary transition-colors line-clamp-2">
                  {nextArticle.title}
                </span>
              </a>
            ) : (
              <div />
            )}
          </nav>
        )}
      </article>
    </div>
  );
}
