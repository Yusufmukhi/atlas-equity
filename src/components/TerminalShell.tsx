import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, LogOut, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TerminalShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = q.trim().toUpperCase();
    if (s) navigate({ to: "/company/$symbol", params: { symbol: s } });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-12 flex items-center gap-6">
          <Link to="/dashboard" className="flex items-center gap-2">
            <LineChart className="size-5 text-primary" strokeWidth={1.5} />
            <span className="text-xs tracking-[0.18em] text-primary font-semibold mono uppercase">
              ERT
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-xs uppercase tracking-wider">
            <Link
              to="/dashboard"
              className="px-2 py-1 rounded text-muted-foreground hover:text-foreground"
              activeProps={{ className: "px-2 py-1 rounded text-primary" }}
            >
              Coverage
            </Link>
            <Link
              to="/screener"
              className="px-2 py-1 rounded text-muted-foreground hover:text-foreground"
              activeProps={{ className: "px-2 py-1 rounded text-primary" }}
            >
              Screener
            </Link>
            <Link
              to="/journal"
              className="px-2 py-1 rounded text-muted-foreground hover:text-foreground"
              activeProps={{ className: "px-2 py-1 rounded text-primary" }}
            >
              Journal
            </Link>
            <Link
              to="/upload"
              className="px-2 py-1 rounded text-muted-foreground hover:text-foreground"
              activeProps={{ className: "px-2 py-1 rounded text-primary" }}
            >
              Upload
            </Link>
          </nav>
          <form onSubmit={onSubmit} className="flex-1 max-w-md ml-auto relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search ticker (e.g. TATASTEEL, HAL)"
              className="h-8 pl-8 mono text-xs uppercase tracking-wider"
            />
          </form>
          <div className="flex items-center gap-3">
            <span className="text-[10px] mono text-muted-foreground hidden md:inline">{email}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="size-3.5" />
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
