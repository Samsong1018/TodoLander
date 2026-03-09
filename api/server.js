const express = require('express');
const cors = require('cors');
const uuid = require('uuid')
const sql = require('./db')
const bcrypt = require('bcrypt')

const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: 'http://127.0.0.1:5500', // update to match your frontend origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions)); // handle preflight for all routes

app.use(express.json());

/* Authentication Middleware */

const authenticateToken = async (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const rows = await sql`
      SELECT sessions.*, users.email, users.full_name, users.cal_data
      FROM sessions
      JOIN users ON sessions.user_id = users.id
      WHERE sessions.token = ${token}
    `;

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const session = rows[0];

    if (new Date() > new Date(session.expires_at)) {
      await sql`DELETE FROM sessions WHERE token = ${token}`;
      return res.status(401).json({ error: 'Token expired' });
    }

    req.user = session;
    next();

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/* Get User Data */

app.get('/api/user', (req, res) => {
    authenticateToken(req, res, () => {
        res.status(200).json(req.user.cal_data)
    });
});

/* Save User Data */

app.put('/api/user', (req, res) => {
    authenticateToken(req, res, async () => {
        const { todos, recurring, recurringState } = req.body;

        try {
            await sql`
                UPDATE users
                SET cal_data = ${sql.json({ todos, recurring, recurringState })}
                WHERE id = ${req.user.user_id}
            `;
            res.status(200).json({ message: 'success' });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Server Error' });
        }
    });
});

/* Logout */

app.post('/api/logout', (req, res) => {
    authenticateToken(req, res, async () => {
        const token = req.headers['authorization']?.split(' ')[1];
        try {
            await sql`DELETE FROM sessions WHERE token = ${token}`;
            res.status(200).json({ message: 'success' });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Server Error' });
        }
    });
});

/* Singup and Login endpoints */

app.post('/api/signup', async (req, res) => {
    const { email, password, name } = req.body

    try {
        const existing = await sql`
            SELECT id FROM users WHERE email = ${email}
        `;
        if (existing.length > 0) {
            return res.status(409).json({ error: "email already in use" });
        }

        const hash = await bcrypt.hash(password, 10)

        const [user] = await sql`
            INSERT INTO users (email, password, full_name)
            VALUES (${email}, ${hash}, ${name})
            RETURNING id, email, full_name, created_at, cal_data
        `;

        res.status(201).json({message: "success"});
    } catch (err) {
        console.error(err);
        res.status(500).json({error: 'Server Error'})
    };
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const token = uuid.v4();
    const expires_at = new Date(Date.now() + 1000 * 60 * 60 * 24);

    /* check if users in database */
    try {
        const users = await sql`
            SELECT * FROM users WHERE email = ${email}
        `;

        if (users.length === 0) {
            return res.status(401).json({error: "Invalid email or password"})
        };

        const user = users[0];
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(401).json({error: "Invalid email or password"});
        };

        const existing = await sql`
            SELECT token, expires_at FROM sessions
            WHERE user_id = ${user.id} AND expires_at > NOW()
            ORDER BY expires_at DESC
            LIMIT 1
        `;

        if (existing.length > 0) {
            return res.status(200).json({ message: "success", data: { token: existing[0].token, expires_at: existing[0].expires_at } });
        }

        await sql`
            INSERT INTO sessions (user_id, token, expires_at)
            VALUES (${user.id}, ${token}, ${expires_at})
        `;

        res.status(201).json({message: "success", data: {token, expires_at}});
    } catch (err) {
        console.log(err);
        res.status(500).json({ error: "Server Error" });
    };
});

app.listen(PORT, () => {
    console.log(`Listening on port: ${PORT}`);
});