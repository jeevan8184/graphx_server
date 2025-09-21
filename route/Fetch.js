const express = require("express");
const router = express.Router();
const UserChart = require("../model/chartt");

// POST /save-chart => Save chart to a user
router.post("/save", async (req, res) => {
  const { email, chartDetails } = req.body;

  if (!email || !chartDetails) {
    return res
      .status(400)
      .json({ error: "Email and chartDetails are required." });
  }

  try {
    let user = await UserChart.findOne({ email });

    if (!user) {
      user = new UserChart({
        email,
        charts: [{ serial: 1, chartDetails }],
      });
    } else {
      const nextSerial = user.charts.length + 1;
      user.charts.push({ serial: nextSerial, chartDetails });
    }

    await user.save();
    res
      .status(200)
      .json({ message: "Chart saved successfully!", charts: user.charts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save chart." });
  }
});

// GET /charts/:email => Get all charts for a user
router.get("/charts/:email", async (req, res) => {
  const { email } = req.params;

  try {
    const user = await UserChart.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(200).json({ charts: user.charts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch charts." });
  }
});
// DELETE /delete/:email/:serial => Delete a specific chart by serial number
router.delete("/delete/:email/:serial", async (req, res) => {
  const { email, serial } = req.params;

  try {
    const user = await UserChart.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    // Filter out the chart with the given serial number
    const updatedCharts = user.charts.filter(
      (chart) => chart.serial !== parseInt(serial)
    );

    // If no chart was removed
    if (updatedCharts.length === user.charts.length) {
      return res.status(404).json({ error: "Chart not found." });
    }

    // Update serial numbers after deletion
    updatedCharts.forEach((chart, index) => {
      chart.serial = index + 1;
    });

    user.charts = updatedCharts;
    await user.save();

    res.status(200).json({
      message: `Chart with serial ${serial} deleted successfully.`,
      charts: user.charts,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete chart." });
  }
});

module.exports = router;
