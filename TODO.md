# TODO: Enhance getAllPosts with Comments

## Steps:

1. [x] Update controllers/blogController.js: Modify getAllPosts to fetch approved comments for each post and nest them in response.
2. [x] Test the endpoint (GET http://localhost:3000/api/blogs - mapped from routes/blogRoute.js router.get("/", blogController.getAllPosts)).
3. [x] Verified: Response is { success: true, data: [posts...] } where each post now has "comments: []" array of approved comments.
4. [x] [Complete]
