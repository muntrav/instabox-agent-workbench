import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SupportCard() {
  return (
    <Card size="sm" className="overflow-hidden shadow-none group-data-[collapsible=icon]:hidden">
      <CardHeader className="min-w-0 px-4">
        <CardTitle className="truncate text-sm">Nemo is in preview</CardTitle>
        <CardDescription className="line-clamp-3">
          The dashboard shell is ready. Instabox actions will be added behind the control plane.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
