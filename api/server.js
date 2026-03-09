const express = require('express');
const app = express();
const PORT = 3000;

app.post('/api/signup', (req, res) => {
    console.log("signup");
});

app.post('/api/login', (req, res) => {
    console.log("Login");
});

app.listen(PORT, () => {
    console.log(`Listening on port: ${PORT}`);
});