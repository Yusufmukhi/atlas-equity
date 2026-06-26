import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Equity Research Terminal — AI Research for Indian Listed Companies" },
      { name: "description", content: "Institutional-grade, AI-powered equity research workspace for NSE and BSE listed companies." },
      { property: "og:title", content: "Equity Research Terminal" },
      { property: "og:description", content: "Institutional-grade AI equity research workspace." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    throw redirect({ to: data.user ? "/dashboard" : "/auth" });
  },
  component: () => null,
});
