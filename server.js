/*
 * server.js
 * Version 0.0.alpha-2
 * This version fixes a data serialization bug by ensuring all MongoDB ObjectIds
 * are converted to strings before being sent in the API response.
 */

const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- Database Connection ---
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
    console.error("FATAL ERROR: MONGODB_URI environment variable is not set.");
    process.exit(1);
}

const client = new MongoClient(mongoUri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

let db, usersCollection, postsCollection;

async function connectDB() {
    try {
        await client.connect();
        db = client.db("oldschool_mk");
        usersCollection = db.collection("users");
        postsCollection = db.collection("posts");
        console.log("Successfully connected to MongoDB Atlas!");
    } catch (error) {
        console.error("Failed to connect to MongoDB", error);
        process.exit(1);
    }
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// --- API Routes ---

// GET /api/config
app.get('/api/config', (req, res) => {
    res.json({ apiKey: process.env.GEMINI_API_KEY });
});

// POST /api/login
app.post('/api/login', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username || username.length < 3) {
            return res.status(400).json({ message: 'Username must be at least 3 characters long.' });
        }
        const filter = { username: { $regex: new RegExp(`^${username}$`, 'i') } };
        let user = await usersCollection.findOne(filter);
        if (!user) {
            const newUserDocument = { username: username, following: [] };
            await usersCollection.insertOne(newUserDocument);
            user = newUserDocument;
        }
        res.status(200).json(user);
    } catch (error) {
        console.error('[POST /api/login] Error:', error);
        res.status(500).json({ message: 'Server failed during login/registration.' });
    }
});

// GET /api/users/:username
app.get('/api/users/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const user = await usersCollection.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
        res.json(user);
    } catch (error) {
        console.error('[GET /api/users/:username] Error:', error);
        res.status(500).json({ message: 'Server error while fetching user.' });
    }
});

// GET /api/posts - Get all posts for the global feed
app.get('/api/posts', async (req, res) => {
    try {
        console.log("Attempting to fetch posts from database...");
        const postsArray = await postsCollection.find().sort({ timestamp: -1 }).toArray();
        console.log(`Successfully fetched ${postsArray.length} posts.`);
        // **FIX:** Ensure all _id fields are strings before sending
        const sanitizedPosts = postsArray.map(post => ({ ...post, _id: post._id.toString() }));
        res.json(sanitizedPosts);
    } catch (error) {
        console.error('[GET /api/posts] Error:', error);
        res.status(500).json({ message: 'Server error while fetching posts.' });
    }
});

// GET /api/posts/user/:username
app.get('/api/posts/user/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const postsArray = await postsCollection.find({ username: username }).sort({ timestamp: -1 }).toArray();
        // **FIX:** Ensure all _id fields are strings before sending
        const sanitizedPosts = postsArray.map(post => ({ ...post, _id: post._id.toString() }));
        res.json(sanitizedPosts);
    } catch (error)
        {
        console.error('[GET /api/posts/user/:username] Error:', error);
        res.status(500).json({ message: 'Server error while fetching user posts.' });
    }
});

// POST /api/posts
app.post('/api/posts', async (req, res) => {
    try {
        const { username, text, image } = req.body;
        if (!username || !text) {
            return res.status(400).json({ message: 'Username and text are required.' });
        }
        const newPost = {
            username,
            text,
            image: image || null,
            timestamp: new Date(),
            likes: [],
        };
        const result = await postsCollection.insertOne(newPost);
        // Ensure the returned post has a string ID
        const createdPost = { ...newPost, _id: result.insertedId.toString() };
        res.status(201).json(createdPost);
    } catch (error) {
        console.error('[POST /api/posts] Error:', error);
        res.status(500).json({ message: 'Server failed to create post.' });
    }
});

// POST /api/posts/:id/like
app.post('/api/posts/:id/like', async (req, res) => {
    try {
        const { id } = req.params;
        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ message: 'Username is required to like a post.' });
        }

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid post ID format.' });
        }

        const post = await postsCollection.findOne({ _id: new ObjectId(id) });
        if (!post) {
            return res.status(404).json({ message: 'Post not found.' });
        }

        let updateOperation;
        if (post.likes.includes(username)) {
            updateOperation = { $pull: { likes: username } };
        } else {
            updateOperation = { $addToSet: { likes: username } };
        }

        const result = await postsCollection.findOneAndUpdate(
            { _id: new ObjectId(id) },
            updateOperation,
            { returnDocument: 'after' }
        );

        res.status(200).json(result.value);
    } catch (error) {
        console.error('[POST /api/posts/:id/like] Error:', error);
        res.status(500).json({ message: 'Server error during like action.' });
    }
});


// POST /api/follow
app.post('/api/follow', async (req, res) => {
    try {
        const { follower, userToFollow } = req.body;
        const followerUser = await usersCollection.findOne({ username: follower });
        if (!followerUser) {
             return res.status(404).json({ message: 'Follower user not found.' });
        }
        let updateOperation;
        if (followerUser.following.includes(userToFollow)) {
            updateOperation = { $pull: { following: userToFollow } };
        } else {
            updateOperation = { $addToSet: { following: userToFollow } };
        }
        const result = await usersCollection.findOneAndUpdate(
            { username: follower },
            updateOperation,
            { returnDocument: 'after' }
        );
        res.status(200).json(result.value);
    } catch (error) {
        console.error('[POST /api/follow] Error:', error);
        res.status(500).json({ message: 'Server error during follow action.' });
    }
});

// Start the server after connecting to the DB
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
});
