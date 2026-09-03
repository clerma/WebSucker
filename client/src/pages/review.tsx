import { FormEvent, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useSeo } from "@/lib/seo";
import { WsLogo } from "@/components/logo";

export default function ReviewPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  useSeo({
    title: "Share Your Review | Website Sucker",
    description: "Tell us about your experience using Website Sucker.",
    canonicalPath: "/review",
    noIndex: true,
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, rating, review, website }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Your review could not be submitted.");
      setSubmitted(true);
    } catch (error) {
      toast({
        title: "Review not submitted",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-12 sm:py-16">
      <div className="mx-auto w-full max-w-xl">
        <a href="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Website Sucker
        </a>
        <Card className="shadow-sm">
          <CardHeader className="text-center">
            <div className="mb-2 flex justify-center">
              <WsLogo markClassName="h-8 w-auto" />
            </div>
            <CardTitle className="text-2xl">
              {submitted ? "Thank you for your review" : "How did Website Sucker work for you?"}
            </CardTitle>
            <CardDescription>
              {submitted
                ? "Your feedback has been sent. We appreciate you taking the time to share it."
                : "Your feedback helps us improve website backups for everyone."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {submitted ? (
              <div className="space-y-6 py-4 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
                <Button asChild className="w-full"><a href="/">Return to Website Sucker</a></Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label>Your rating</Label>
                  <div className="flex justify-center gap-2" role="radiogroup" aria-label="Rating">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={rating === value}
                        aria-label={`${value} star${value === 1 ? "" : "s"}`}
                        onClick={() => setRating(value)}
                        className="rounded-md p-1 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Star className={`h-8 w-8 ${value <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="review-name">Name</Label>
                    <Input id="review-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="review-email">Email</Label>
                    <Input id="review-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required />
                  </div>
                </div>
                <div className="hidden" aria-hidden="true">
                  <Label htmlFor="review-website">Website</Label>
                  <Input id="review-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="review-message">Your review</Label>
                  <Textarea
                    id="review-message"
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                    placeholder="What worked well? Is there anything we could improve?"
                    minLength={10}
                    maxLength={2000}
                    rows={7}
                    required
                  />
                  <p className="text-right text-xs text-muted-foreground">{review.length}/2000</p>
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit review
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  Your email is used only to identify your purchase and reply if needed.
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}