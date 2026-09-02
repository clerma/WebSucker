import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
        {/* Brand: the URL field is the hero — sharp, 2px ruled, one blue action */}
        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem className="w-full">
              <div className="flex items-stretch border-2 border-foreground bg-card focus-within:border-primary transition-colors">
                <span className="flex items-center pl-4 pr-1 font-mono text-sm text-muted-foreground select-none">
                  https://
                </span>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="example.com"
                    className="h-14 flex-1 rounded-none border-0 bg-transparent px-1 font-mono text-base shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
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
