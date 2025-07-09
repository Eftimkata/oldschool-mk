/*
 * server.js
 * Version 0.0.3-alpha
 * This version adds the backend endpoint and logic for a "Forgot Password" feature.
 * The actual email sending is commented out and explained.
 */

const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const path = require('path');
const bcrypt = require('bcrypt');
const crypto = require('crypto'); // To generate secure random tokens
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const saltRounds = 10;

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

// POST /api/register
app.post('/api/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        if (!username || !password || !email || password.length < 6) {
            return res.status(400).json({ message: 'Username, email, and a password of at least 6 characters are required.' });
        }
        const existingUser = await usersCollection.findOne({
            $or: [
                { username: { $regex: new RegExp(`^${username}$`, 'i') } },
                { email: { $regex: new RegExp(`^${email}$`, 'i') } }
            ]
        });
        if (existingUser) {
            const message = existingUser.username.toLowerCase() === username.toLowerCase() ? 'Username is already taken.' : 'Email is already in use.';
            return res.status(409).json({ message });
        }
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newUserDocument = {
            username: username, email: email, password: hashedPassword, following: []
        };
        await usersCollection.insertOne(newUserDocument);
        res.status(201).json({ username: newUserDocument.username });
    } catch (error) {
        console.error('[POST /api/register] Error:', error);
        res.status(500).json({ message: 'Server failed during registration.' });
    }
});

// POST /api/login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required.' });
        }
        const user = await usersCollection.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Invalid username or password.' });
        }
        res.status(200).json({ username: user.username });
    } catch (error) {
        console.error('[POST /api/login] Error:', error);
        res.status(500).json({ message: 'Server failed during login.' });
    }
});

// NEW: POST /api/forgot-password - Handles the start of the password reset flow
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Email is required.' });
        }

        const user = await usersCollection.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });

        if (user) {
            // Generate a secure, temporary token
            const resetToken = crypto.randomBytes(32).toString('hex');
            const tokenExpiry = Date.now() + 3600000; // 1 hour from now

            // Store the token and its expiry date in the user's document
            await usersCollection.updateOne(
                { _id: user._id },
                { $set: { resetPasswordToken: resetToken, resetPasswordExpires: tokenExpiry } }
            );

            //
            // --- EMAIL SENDING LOGIC WOULD GO HERE ---
            //
            // 1. You would use a third-party email service like SendGrid, Mailgun, or Postmark.
            // 2. You would need an API key from that service, stored as an environment variable.
            // 3. You would call their API to send an email to `user.email`.
            //
            // The email would contain a link like this:
            // const resetURL = `https://oldschool-mk.onrender.com/reset-password.html?token=${resetToken}`;
            //
            // Example using a hypothetical 'sendEmail' function:
            //
            // await sendEmail({
            //   to: user.email,
            //   from: 'no-reply@oldschoolmk.com',
            //   subject: 'Old School MK - Password Reset',
            //   text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n` +
            //         `Please click on the following link, or paste this into your browser to complete the process:\n\n` +
            //         `${resetURL}\n\n` +
            //         `If you did not request this, please ignore this email and your password will remain unchanged.\n`
            // });
            //
            console.log(`Password reset token for ${user.email}: ${resetToken}`); // For testing purposes
        }

        // Always send a success message to prevent user enumeration attacks
        // (i.e., prevent attackers from checking which emails are registered).
        res.status(200).json({ message: 'If an account with that email exists, a password reset link has been sent.' });

    } catch (error) {
        console.error('[POST /api/forgot-password] Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});


// GET /api/users/:username
app.get('/api/users/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const user = await usersCollection.findOne(
            { username: { $regex: new RegExp(`^${username}$`, 'i') } },
            { projection: { password: 0, email: 0 } }
        );
        res.json(user);
    } catch (error) {
        console.error('[GET /api/users/:username] Error:', error);
        res.status(500).json({ message: 'Server error while fetching user.' });
    }
});

// GET /api/posts
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
        if (!username || !ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Invalid request.' });
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
