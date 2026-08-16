import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Globe, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { startScrapeSchema, type StartScrapeInput } from "@shared/schema";

interface UrlInputFormProps {
  onSubmit: (data: StartScrapeInput) => void;
  isLoading: boolean;
}

export function UrlInputForm({ onSubmit, isLoading }: UrlInputFormProps) {
  const form = useForm<StartScrapeInput>({
    resolver: zodResolver(startScrapeSchema),
    defaultValues: {
      url: "",
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="w-full max-w-2xl mx-auto"
      >
        <div className="group relative flex items-center">
          {/* Soft glow that intensifies on focus */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-1 rounded-full bg-gradient-to-r from-primary/30 via-chart-4/25 to-primary/30 opacity-0 blur-lg transition-opacity duration-500 group-focus-within:opacity-100"
          />
          <div className="absolute left-4 text-muted-foreground z-10 transition-colors duration-300 group-focus-within:text-primary">
            <Globe className="h-5 w-5" />
          </div>
          <FormField
            control={form.control}
            name="url"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input
                    {...field}
                    placeholder="https://example.com"
                    className="relative pl-12 pr-32 h-14 text-base rounded-full border-2 focus:border-primary transition-colors"
                    disabled={isLoading}
                    data-testid="input-url"
                  />
                </FormControl>
                <FormMessage className="mt-2 text-center" />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            disabled={isLoading}
            className="absolute right-2 z-10 h-10 px-6 rounded-full gap-2 transition-transform duration-200 hover:scale-[1.03] active:scale-95"
            data-testid="button-start-scrape"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Scraping</span>
              </>
            ) : (
              <>
                <span>Start</span>
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
