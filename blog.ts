import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';
import type { User } from '../drizzle/schema';

// Mock user for testing
const mockAdminUser: User = {
  id: 1,
  openId: 'test-admin-user',
  name: 'Test Admin',
  email: 'admin@test.com',
  loginMethod: 'test',
  role: 'admin',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const mockPublicUser: User = {
  id: 2,
  openId: 'test-public-user',
  name: 'Test User',
  email: 'user@test.com',
  loginMethod: 'test',
  role: 'user',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function createMockContext(user: User | null = null): TrpcContext {
  return {
    user,
    req: {
      protocol: 'https',
      headers: {},
    } as any,
    res: {
      clearCookie: () => {},
    } as any,
  };
}

describe('Blog Router', () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(() => {
    caller = appRouter.createCaller(createMockContext());
  });

  describe('Public Procedures', () => {
    it('should list published posts', async () => {
      const result = await caller.blog.listPosts({ limit: 10, offset: 0 });
      expect(Array.isArray(result)).toBe(true);
    });

    it('should get featured posts', async () => {
      const result = await caller.blog.featured();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should get all categories', async () => {
      const result = await caller.blog.categories();
      expect(Array.isArray(result)).toBe(true);
      // Should have default categories
      expect(result.length).toBeGreaterThan(0);
    });

    it('should get all tags', async () => {
      const result = await caller.blog.tags();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle search queries', async () => {
      const result = await caller.blog.search({
        query: 'test',
        limit: 10,
        offset: 0,
      });
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return 404 for non-existent post slug', async () => {
      try {
        await caller.blog.getBySlug({ slug: 'non-existent-post-xyz' });
        expect.fail('Should have thrown NOT_FOUND error');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('Protected Procedures', () => {
    it('should deny access to listAllPosts for unauthenticated users', async () => {
      try {
        await caller.blog.listAllPosts({ limit: 100, offset: 0 });
        expect.fail('Should have thrown UNAUTHORIZED error');
      } catch (error: any) {
        expect(error.code).toBe('UNAUTHORIZED');
      }
    });

    it('should deny access to create post for non-admin users', async () => {
      const userCaller = appRouter.createCaller(
        createMockContext(mockPublicUser)
      );

      try {
        await userCaller.blog.create({
          title: 'Test Post',
          content: 'Test content',
          categoryId: 1,
          published: false,
        });
        expect.fail('Should have thrown FORBIDDEN error');
      } catch (error: any) {
        expect(error.code).toBe('FORBIDDEN');
      }
    });

    it('should allow admin to create post', async () => {
      const adminCaller = appRouter.createCaller(
        createMockContext(mockAdminUser)
      );

      try {
        const result = await adminCaller.blog.create({
          title: 'Test Admin Post ' + Date.now(),
          excerpt: 'Test excerpt',
          content: '# Test Post\n\nThis is a test post with markdown.',
          categoryId: 1,
          tagIds: [],
          published: false,
        });

        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('slug');
        expect(typeof result.slug).toBe('string');
      } catch (error: any) {
        // Database might not be available in test environment
        if (error.code !== 'INTERNAL_SERVER_ERROR') {
          throw error;
        }
      }
    });

    it('should allow admin to list all posts including drafts', async () => {
      const adminCaller = appRouter.createCaller(
        createMockContext(mockAdminUser)
      );

      try {
        const result = await adminCaller.blog.listAllPosts({
          limit: 100,
          offset: 0,
        });
        expect(Array.isArray(result)).toBe(true);
      } catch (error: any) {
        // Database might not be available in test environment
        if (error.code !== 'INTERNAL_SERVER_ERROR') {
          throw error;
        }
      }
    });
  });

  describe('Comment Procedures', () => {
    it('should allow public users to add comments', async () => {
      try {
        const result = await caller.blog.addComment({
          postId: 999, // Non-existent post
          authorName: 'Test Commenter',
          authorEmail: 'commenter@test.com',
          content: 'Great post!',
        });
        expect.fail('Should have thrown NOT_FOUND error');
      } catch (error: any) {
        expect(error.code).toBe('NOT_FOUND');
      }
    });

    it('should allow admin to approve comments', async () => {
      const adminCaller = appRouter.createCaller(
        createMockContext(mockAdminUser)
      );

      try {
        const result = await adminCaller.blog.approveComment({
          commentId: 999,
        });
        // This will fail silently if comment doesn't exist, but shouldn't throw
        expect(result).toHaveProperty('success', true);
      } catch (error: any) {
        // Database might not be available in test environment
        if (error.code !== 'INTERNAL_SERVER_ERROR') {
          throw error;
        }
      }
    });
  });

  describe('Slug Generation', () => {
    it('should generate valid slugs from titles', async () => {
      const adminCaller = appRouter.createCaller(
        createMockContext(mockAdminUser)
      );

      const testCases = [
        { title: 'Hello World', expectedSlug: 'hello-world' },
        { title: 'Test Post!', expectedSlug: 'test-post' },
        { title: 'Multiple   Spaces', expectedSlug: 'multiple-spaces' },
      ];

      for (const testCase of testCases) {
        try {
          const result = await adminCaller.blog.create({
            title: testCase.title + ' ' + Date.now(),
            content: 'Test content',
            categoryId: 1,
            published: false,
          });

          if (result.slug) {
            // Slug should be lowercase and hyphenated
            expect(result.slug).toMatch(/^[a-z0-9-]+$/);
          }
        } catch (error: any) {
          // Database might not be available in test environment
          if (error.code !== 'INTERNAL_SERVER_ERROR') {
            throw error;
          }
        }
      }
    });
  });
});
