import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, publicProcedure, router } from './_core/trpc';
import {
  getPublishedPosts,
  getAllPostsForAdmin,
  getPostBySlug,
  getPostsByCategory,
  getPostsByTag,
  searchPosts,
  getAllCategories,
  getCategoryBySlug,
  getAllTags,
  getTagBySlug,
  getPostTags,
  getPostComments,
  incrementPostViews,
  getFeaturedPosts,
  upsertCategory,
  upsertTag,
} from './db';
import { getDb } from './db';
import { posts, comments, postTags, tags } from '../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { notifyOwner } from './_core/notification';

// Helper to generate slug from title
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Helper to calculate reading time (rough estimate: 200 words per minute)
function calculateReadingTime(content: string): number {
  const wordCount = content.split(/\s+/).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

export const blogRouter = router({
  // PUBLIC PROCEDURES
  featured: publicProcedure.query(async () => {
    return getFeaturedPosts();
  }),

  listPosts: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return getPublishedPosts(input.limit, input.offset);
    }),

  listAllPosts: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(100),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.user?.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Unauthorized' });
      }
      return getAllPostsForAdmin(input.limit, input.offset);
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const post = await getPostBySlug(input.slug);
      if (!post) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      }

      await incrementPostViews(post.id);
      const postTagsData = await getPostTags(post.id);
      const postTagsList = postTagsData.map((pt) => pt.tag);

      return {
        ...post,
        tags: postTagsList,
      };
    }),

  getByCategory: publicProcedure
    .input(
      z.object({
        categorySlug: z.string(),
        limit: z.number().min(1).max(50).default(10),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const category = await getCategoryBySlug(input.categorySlug);
      if (!category) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Category not found' });
      }

      const postsData = await getPostsByCategory(
        input.categorySlug,
        input.limit,
        input.offset
      );
      return {
        category,
        posts: postsData.map((p) => p.post),
      };
    }),

  getByTag: publicProcedure
    .input(
      z.object({
        tagSlug: z.string(),
        limit: z.number().min(1).max(50).default(10),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const tag = await getTagBySlug(input.tagSlug);
      if (!tag) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag not found' });
      }

      const postsData = await getPostsByTag(
        input.tagSlug,
        input.limit,
        input.offset
      );
      return {
        tag,
        posts: postsData.map((p) => p.post),
      };
    }),

  search: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(50).default(10),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return searchPosts(input.query, input.limit, input.offset);
    }),

  categories: publicProcedure.query(async () => {
    return getAllCategories();
  }),

  tags: publicProcedure.query(async () => {
    return getAllTags();
  }),

  getComments: publicProcedure
    .input(z.object({ postId: z.number() }))
    .query(async ({ input }) => {
      return getPostComments(input.postId);
    }),

  addComment: publicProcedure
    .input(
      z.object({
        postId: z.number(),
        authorName: z.string().min(1).max(128),
        authorEmail: z.string().email().max(320),
        content: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database not available',
        });
      }

      const post = await db
        .select()
        .from(posts)
        .where(eq(posts.id, input.postId))
        .limit(1);

      if (post.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      }

      await db.insert(comments).values({
        postId: input.postId,
        authorName: input.authorName,
        authorEmail: input.authorEmail,
        content: input.content,
        approved: 0,
      });

      await notifyOwner({
        title: 'New Comment on Your Blog',
        content: `${input.authorName} commented on "${post[0].title}": ${input.content.substring(0, 100)}...`,
      });

      return { success: true };
    }),

  // PROTECTED PROCEDURES (Owner only)
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        excerpt: z.string().max(500).optional(),
        content: z.string().min(1),
        categoryId: z.number(),
        tagIds: z.array(z.number()).default([]),
        featuredImage: z.string().optional(),
        seoTitle: z.string().max(255).optional(),
        seoDescription: z.string().max(512).optional(),
        published: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Unauthorized' });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database not available',
        });
      }

      const slug = generateSlug(input.title);
      const readingTime = calculateReadingTime(input.content);

      const existing = await db
        .select()
        .from(posts)
        .where(eq(posts.slug, slug))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A post with this title already exists',
        });
      }

      await db.insert(posts).values({
        title: input.title,
        slug,
        excerpt: input.excerpt,
        content: input.content,
        categoryId: input.categoryId,
        authorId: ctx.user.id,
        featuredImage: input.featuredImage,
        published: input.published ? 1 : 0,
        readingTime,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        publishedAt: input.published ? new Date() : null,
      });

      if (input.tagIds.length > 0) {
        const created = await db
          .select()
          .from(posts)
          .where(eq(posts.slug, slug))
          .limit(1);

        if (created.length > 0) {
          await db.insert(postTags).values(
            input.tagIds.map((tagId) => ({
              postId: created[0].id,
              tagId,
            }))
          );
        }
      }

      if (input.published) {
        await notifyOwner({
          title: 'New Blog Post Published',
          content: `Your post "${input.title}" has been published!`,
        });
      }

      return { success: true, slug };
    }),

  update: protectedProcedure
    .input(
      z.object({
        postId: z.number(),
        title: z.string().min(1).max(255).optional(),
        excerpt: z.string().max(500).optional(),
        content: z.string().min(1).optional(),
        categoryId: z.number().optional(),
        tagIds: z.array(z.number()).optional(),
        featuredImage: z.string().optional(),
        seoTitle: z.string().max(255).optional(),
        seoDescription: z.string().max(512).optional(),
        published: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Unauthorized' });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database not available',
        });
      }

      const post = await db
        .select()
        .from(posts)
        .where(eq(posts.id, input.postId))
        .limit(1);

      if (post.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Post not found' });
      }

      const updateData: any = {};
      if (input.title) updateData.title = input.title;
      if (input.excerpt !== undefined) updateData.excerpt = input.excerpt;
      if (input.content) {
        updateData.content = input.content;
        updateData.readingTime = calculateReadingTime(input.content);
      }
      if (input.categoryId) updateData.categoryId = input.categoryId;
      if (input.featuredImage !== undefined) updateData.featuredImage = input.featuredImage;
      if (input.seoTitle !== undefined) updateData.seoTitle = input.seoTitle;
      if (input.seoDescription !== undefined) updateData.seoDescription = input.seoDescription;
      if (input.published !== undefined) {
        updateData.published = input.published ? 1 : 0;
        if (input.published && !post[0].publishedAt) {
          updateData.publishedAt = new Date();
        }
      }

      await db.update(posts).set(updateData).where(eq(posts.id, input.postId));

      if (input.tagIds) {
        await db.delete(postTags).where(eq(postTags.postId, input.postId));
        if (input.tagIds.length > 0) {
          await db.insert(postTags).values(
            input.tagIds.map((tagId) => ({
              postId: input.postId,
              tagId,
            }))
          );
        }
      }

      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ postId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Unauthorized' });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database not available',
        });
      }

      await db.delete(postTags).where(eq(postTags.postId, input.postId));
      await db.delete(comments).where(eq(comments.postId, input.postId));
      await db.delete(posts).where(eq(posts.id, input.postId));

      return { success: true };
    }),

  approveComment: protectedProcedure
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Unauthorized' });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database not available',
        });
      }

      await db
        .update(comments)
        .set({ approved: 1 })
        .where(eq(comments.id, input.commentId));

      return { success: true };
    }),

  deleteComment: protectedProcedure
    .input(z.object({ commentId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user?.role !== 'admin') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Unauthorized' });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Database not available',
        });
      }

      await db.delete(comments).where(eq(comments.id, input.commentId));

      return { success: true };
    }),
});
