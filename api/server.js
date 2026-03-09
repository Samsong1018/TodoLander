const express = require('express');
const uuid = require('uuid')
const pool = require('./db')
const bcrypt = require('bcrypt')

const app = express();
const PORT = process.env.PORT || 3000;

/* Singup and Login endpoints */

app.post('/api/signup', (req, res) => {
    console.log("signup");
});

app.post('/api/signup', async (req, res) => {
    const { email, password, name } = req.body

    try {
        const existing = await pool.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: "email already in use" });
        }

        const hash = await bcrypt.hash(password, 10)

        const result = await pool.query(
            `INSERT INTO users (email, password, name, token_data, user_data)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, email, name, created_at, token_data, user_data`,
            [email, hash, name, {}, {}]
        );

        res.status(201).json({message: "success"});
    } catch (err) {
        console.error(err);
        res.status(500).json({error: 'Server Error'})
    };
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const token = uuid.v4();

    /* check if users in database */
    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );

        if (result.row.length === 0) {
            return res.status(401).json({error: "Invalid email or password"})
        };

        const user = result.rows[o];

        const match = await bcrypt.compare(password, user.password);

        console.log(user)

        if (!match) {
            return res.status(401).json({error: "Invalid email or password"})
        };

        res.status(201).json({message: "success", data: user.user_data});
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "server error" });
    };
});

app.listen(PORT, () => {
    console.log(`Listening on port: ${PORT}`);
});