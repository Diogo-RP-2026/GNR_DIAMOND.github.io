import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "@/routeTree.gen";
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
it("monta a aplicação estática sem um documento HTML dentro do root", async () => {
  vi.stubEnv("VITE_STATIC_PAGES", "true");
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
    context: { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
  });
  const { container } = render(<RouterProvider router={router} />);
  await screen.findByText(/Falta configurar o Supabase/);
  expect(container.querySelector("html")).toBeNull();
  expect(screen.getByRole("link", { name: "Entrar" })).toBeTruthy();
});
