# Tech & Bug Bounty Blog - TODO

## Database & Backend
- [x] Create blog posts table with slug, title, content, excerpt, published status
- [x] Create categories table with predefined categories (Tech, Bug Bounty, Write-ups, Tools)
- [x] Create tags table and post_tags junction table
- [x] Create comments table with owner notification triggers
- [x] Create views_count tracking for posts
- [x] Add database query helpers in server/db.ts

## Frontend Theme & Design
- [x] Implement retro-futuristic dark theme with terminal aesthetic
- [x] Add scanline effect background texture
- [x] Implement chromatic aberration CSS effect for neon cyan/magenta
- [x] Add monospace error codes and geometric brackets styling
- [x] Configure Tailwind with custom color palette (blacks, greens, cyans, magentas)
- [x] Update global index.css with theme variables and animations

## Public Blog Pages
- [x] Build homepage with hero section and featured posts
- [x] Build latest articles listing with pagination
- [x] Build blog post detail page with markdown rendering
- [x] Implement syntax highlighting for code blocks
- [x] Add reading time estimate calculation
- [x] Build category filter page (/blog/category/tech, etc.)
- [x] Build tag filter page (/blog/tag/security, etc.)
- [x] Implement search functionality with title/tag/content search
- [x] Add SEO meta tags and sitemap support (slug-based URLs, meta descriptions)

## Admin Panel
- [x] Build admin dashboard (owner-only access)
- [x] Create post creation form with markdown editor
- [x] Implement post editing functionality
- [x] Implement post deletion with confirmation
- [x] Add image upload support for posts (via URL)
- [x] Build category and tag management UI (via form)
- [x] Add post publish/draft toggle

## Navigation & Layout
- [x] Build responsive top navigation with logo
- [x] Implement mobile hamburger menu
- [x] Add category links to navigation (Tech, Bug Bounty, Write-ups, Tools)
- [x] Add login/logout controls
- [x] Build about/profile page with bio and skills
- [x] Add social links (GitHub, Twitter, HackerOne, LinkedIn)

## Post Metadata & Display
- [x] Display author name on posts
- [x] Display publish date with formatting
- [x] Calculate and display reading time
- [x] Track and display view count
- [x] Display tag badges on post cards and detail pages
- [x] Show post excerpt on listing pages

## Notifications & Interactions
- [x] Implement owner notification on new post publication
- [x] Implement owner notification on new comments
- [x] Add comment form to blog posts
- [x] Build comments section on post detail page
- [x] Integrate notification API for owner alerts

## Testing & Deployment
- [x] Write vitest tests for blog procedures
- [x] Write vitest tests for post filtering and search
- [x] Test responsive design on mobile, tablet, desktop
- [x] Verify SEO meta tags and sitemap
- [x] Create checkpoint before delivery
