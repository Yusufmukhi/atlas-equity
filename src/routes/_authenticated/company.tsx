import { createFileRoute, Link } from "@tanstack/react-router";
import { Outlet } from "@tanstack/react-router";

// Layout for /company/$symbol nested routes (currently just the index handled by company.$symbol.tsx).
// Provided so report.tsx can also live under /_authenticated/company/$symbol/report.

export const Route = createFileRoute("/_authenticated/company")({
  component: () => <Outlet />,
});
