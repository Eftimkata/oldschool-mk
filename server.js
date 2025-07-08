/*
 * server.js
 * Version 0.0.3-alpha
 * This version introduces password protection using bcrypt for secure hashing
 * and storage. The login/registration flow is completely rebuilt for security.
 */

const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const path = require('path');
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const saltRounds = 10; // For bcrypt hashing

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

// NEW: POST /api/register - Handles new user registration
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password || password.length < 6) {
            return res.status(400).json({ message: 'Username and a password of at least 6 characters are required.' });
        }

        const existingUser = await usersCollection.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
        if (existingUser) {
            return res.status(409).json({ message: 'Username is already taken.' });
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUserDocument = {
            username: username,
            password: hashedPassword,
            following: []
        };
        await usersCollection.insertOne(newUserDocument);

        res.status(201).json({ username: newUserDocument.username });
    } catch (error) {
        console.error('[POST /api/register] Error:', error);
        res.status(500).json({ message: 'Server failed during registration.' });
    }
});

// NEW: POST /api/login - Handles user sign-in
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required.' });
        }

        const user = await usersCollection.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
        if (!user) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }

        res.status(200).json({ username: user.username });
    } catch (error) {
        console.error('[POST /api/login] Error:', error);
        res.status(500).json({ message: 'Server failed during login.' });
    }
});


// GET /api/users/:username - Get a single user's data (without password)
app.get('/api/users/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const user = await usersCollection.findOne(
            { username: { $regex: new RegExp(`^${username}$`, 'i') } },
            { projection: { password: 0 } } // Exclude password from the result
        );
        res.json(user);
    } catch (error) {
        console.error('[GET /api/users/:username] Error:', error);
        res.status(500).json({ message: 'Server error while fetching user.' });
    }
});

// GET /api/posts - Get all posts for the global feed
app.get('/api/posts', async (req, res) => {
    try {
        const postsArray = await postsCollection.find().sort({ timestamp: -1 }).toArray();
        const sanitizedPosts = postsArray.map(post => ({
            likes: [], ...post, _id: post._id.toString()
        }));
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
        const sanitizedPosts = postsArray.map(post => ({
            likes: [], ...post, _id: post._id.toString()
        }));
        res.json(sanitizedPosts);
    } catch (error) {
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
            username, text, image: image || null, timestamp: new Date(), likes: [],
        };
        const result = await postsCollection.insertOne(newPost);
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
        if (post.likes && post.likes.includes(username)) {
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
