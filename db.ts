import { eq, desc, or, like, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, posts, categories, tags, postTags, comments } from "../drizzle/schema";
import { ENV } from './_core/env';
import type { Post, Category, Tag, Comment } from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Get all published posts with pagination
 */
export async function getPublishedPosts(limit: number = 10, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(posts)
    .where(eq(posts.published, 1))
    .orderBy(desc(posts.publishedAt))
    .limit(limit)
    .offset(offset);
}

export async function getAllPostsForAdmin(limit: number = 100, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(posts)
    .orderBy(desc(posts.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Get a single post by slug with category and tags
 */
export async function getPostBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db
    .select()
    .from(posts)
    .where(eq(posts.slug, slug))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

/**
 * Get posts by category
 */
export async function getPostsByCategory(categorySlug: string, limit: number = 10, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select({ post: posts })
    .from(posts)
    .innerJoin(categories, eq(posts.categoryId, categories.id))
    .where(and(eq(categories.slug, categorySlug), eq(posts.published, 1)))
    .orderBy(desc(posts.publishedAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Get posts by tag
 */
export async function getPostsByTag(tagSlug: string, limit: number = 10, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select({ post: posts })
    .from(posts)
    .innerJoin(postTags, eq(posts.id, postTags.postId))
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(and(eq(tags.slug, tagSlug), eq(posts.published, 1)))
    .orderBy(desc(posts.publishedAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Search posts by title, excerpt, or content
 */
export async function searchPosts(query: string, limit: number = 10, offset: number = 0) {
  const db = await getDb();
  if (!db) return [];
  
  const searchTerm = `%${query}%`;
  return db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.published, 1),
        or(
          like(posts.title, searchTerm),
          like(posts.excerpt, searchTerm),
          like(posts.content, searchTerm)
        )
      )
    )
    .orderBy(desc(posts.publishedAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Get all categories
 */
export async function getAllCategories() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(categories).orderBy(categories.name);
}

/**
 * Get category by slug
 */
export async function getCategoryBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

/**
 * Get all tags
 */
export async function getAllTags() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(tags).orderBy(tags.name);
}

/**
 * Get tag by slug
 */
export async function getTagBySlug(slug: string) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db
    .select()
    .from(tags)
    .where(eq(tags.slug, slug))
    .limit(1);
  
  return result.length > 0 ? result[0] : null;
}

/**
 * Get tags for a post
 */
export async function getPostTags(postId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select({ tag: tags })
    .from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(eq(postTags.postId, postId));
}

/**
 * Get approved comments for a post
 */
export async function getPostComments(postId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(comments)
    .where(and(eq(comments.postId, postId), eq(comments.approved, 1)))
    .orderBy(desc(comments.createdAt));
}

/**
 * Increment post view count
 */
export async function incrementPostViews(postId: number) {
  const db = await getDb();
  if (!db) return;
  
  await db
    .update(posts)
    .set({ viewCount: sql`${posts.viewCount} + 1` })
    .where(eq(posts.id, postId));
}

/**
 * Get featured posts (latest 3 published posts)
 */
export async function getFeaturedPosts() {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(posts)
    .where(eq(posts.published, 1))
    .orderBy(desc(posts.publishedAt))
    .limit(3);
}

/**
 * Create or update category
 */
export async function upsertCategory(name: string, slug: string, description?: string) {
  const db = await getDb();
  if (!db) return null;
  
  const existing = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  
  if (existing.length > 0) {
    await db
      .update(categories)
      .set({ name, description })
      .where(eq(categories.slug, slug));
    return existing[0];
  }
  
  await db
    .insert(categories)
    .values({ name, slug, description });
  
  const created = await db
    .select()
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  
  return created.length > 0 ? created[0] : null;
}

/**
 * Create or update tag
 */
export async function upsertTag(name: string, slug: string) {
  const db = await getDb();
  if (!db) return null;
  
  const existing = await db
    .select()
    .from(tags)
    .where(eq(tags.slug, slug))
    .limit(1);
  
  if (existing.length > 0) {
    return existing[0];
  }
  
  await db
    .insert(tags)
    .values({ name, slug });
  
  const created = await db
    .select()
    .from(tags)
    .where(eq(tags.slug, slug))
    .limit(1);
  
  return created.length > 0 ? created[0] : null;
}
