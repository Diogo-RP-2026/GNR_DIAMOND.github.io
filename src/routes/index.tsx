import { createFileRoute } from "@tanstack/react-router";
import { PageContent } from "@/components/portal/PageContent";
export const Route = createFileRoute("/")({ component: Index });
function Index() {
  return <PageContent pageKey="inicio" />;
}
