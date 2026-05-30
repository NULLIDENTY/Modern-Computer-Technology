import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { blogRouter } from "./blog";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  blog: blogRouter,
});

export type AppRouter = typeof appRouter;

// Initialize default categories on startup
import { upsertCategory } from "./db";

const DEFAULT_CATEGORIES = [
  { name: "Tech", slug: "tech", description: "Technology articles and insights" },
  { name: "Bug Bounty", slug: "bug-bounty", description: "Bug bounty findings and writeups" },
  { name: "Write-ups", slug: "write-ups", description: "Security writeups and tutorials" },
  { name: "Tools", slug: "tools", description: "Tools and utilities" },
];

(async () => {
  for (const cat of DEFAULT_CATEGORIES) {
    await upsertCategory(cat.name, cat.slug, cat.description);
  }
})().catch((err) => console.error("Failed to initialize categories:", err));
