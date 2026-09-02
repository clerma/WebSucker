import { useForm } from "react-hook-form";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { type StartScrapeInput } from "@shared/schema";

interface UrlInputFormProps {
  onSubmit: (data: StartScrapeInput) => void;
  isLoading: boolean;
  /** "dark" restyles for the ink hero; logic and structure are unchanged. */
  tone?: "light" | "dark";
}

/** Strip any protocol/leading slashes the user typed or pasted. */
function stripProtocol(value: string): string {
  return value.replace(/^\s*https?:\/\//i, "").replace(/^\/+/, "");
}

export function UrlInputForm({ onSubmit, isLoading, tone = "light" }: UrlInputFormProps) {
  const form = useForm<StartScrapeInput>({
    defaultValues: {
      url: "",
    },
  });

  const dark = tone === "dark";

  // Normalise whatever the user typed into a valid https URL. The visible
  // field holds just the host/path (the "https://" prefix is shown alongside),
  // and we accept pastes that already include a protocol without doubling it.
  const handleSubmit = (data: StartScrapeInput) => {
    const host = stripProtocol((data.url || "").trim());
    if (!host) {
      form.setError("url", { message: "Enter a website URL." });
      return;
    }
    const full = `https://${host}`;
    try {
      const parsed = new URL(full);
      if (!parsed.hostname.includes(".")) throw new Error("no tld");
    } catch {
      form.setError("url", { message: "Enter a valid website address, e.g. example.com" });
      return;
    }
    onSubmit({ url: full });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="w-full max-w-2xl"
      >
        {/* Brand: the URL field is the hero — sharp, 2px ruled, one blue action */}
        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem className="w-full">
              <div
                className={
                  dark
                    ? "flex items-stretch border-2 border-ws-graphite bg-ws-slate focus-within:border-primary transition-colors"
                    : "flex items-stretch border-2 border-foreground bg-card focus-within:border-primary transition-colors"
                }
              >
                <span
                  className={
                    dark
                      ? "flex items-center pl-4 pr-1 font-mono text-sm text-ws-steel select-none"
                      : "flex items-center pl-4 pr-1 font-mono text-sm text-muted-foreground select-none"
                  }
                >
                  https://
                </span>
                <FormControl>
                  <Input
                    {...field}
                    onChange={(e) => {
                      form.clearErrors("url");
                      field.onChange(stripProtocol(e.target.value));
                    }}
                    placeholder="example.com"
                    className={
                      dark
                        ? "h-14 flex-1 rounded-none border-0 bg-transparent px-1 font-mono text-base text-ws-paper placeholder:text-ws-steel shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                        : "h-14 flex-1 rounded-none border-0 bg-transparent px-1 font-mono text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    }
                    disabled={isLoading}
                    data-testid="input-url"
                  />
                </FormControl>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="h-auto shrink-0 gap-2 rounded-none px-6 text-base font-semibold"
                  data-testid="button-start-scrape"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Analysing</span>
                    </>
                  ) : (
                    <>
                      <span>Analyse — free</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
              <FormMessage className="mt-2 font-mono text-xs" />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
