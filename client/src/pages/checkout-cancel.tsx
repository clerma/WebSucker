import { XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function CheckoutCancel() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md" data-testid="checkout-cancel-card">
        <CardHeader className="text-center">
          <XCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <CardTitle>Payment Cancelled</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Your payment was cancelled. No charges were made.
          </p>
          <Button
            className="w-full"
            onClick={() => (window.location.href = "/")}
            data-testid="button-back-home-cancel"
          >
            Back to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
