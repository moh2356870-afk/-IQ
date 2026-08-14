const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    app: "Matjar IQ",
    status: "running",
    message: "Matjar IQ is ready."
  });
});

app.get("/callback", (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).json({
      success: false,
      error
    });
  }

  res.json({
    success: true,
    message: "Salla callback received.",
    code: code || null,
    state: state || null
  });
});

app.listen(PORT, () => {
  console.log(`Matjar IQ running on port ${PORT}`);
});
