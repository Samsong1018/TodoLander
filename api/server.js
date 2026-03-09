const express = require('express');
const uuid = require('uuid')

const app = express();
const PORT = 3000;

/* Singup and Login endpoints */

app.post('/api/signup', (req, res) => {
    console.log("signup");
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const token = uuid.v4();

    /* check if users in database */

    
});

app.listen(PORT, () => {
    console.log(`Listening on port: ${PORT}`);
});