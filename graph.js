const express = require("express");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
const router = express.Router();

const colorSchemes = [
  {
    id: "default",
    label: "Default",
    colors: ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6"],
  },
  {
    id: "vibrant",
    label: "Vibrant",
    colors: ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF"],
  },
  {
    id: "pastel",
    label: "Pastel",
    colors: ["#A2D2FF", "#FFAFCC", "#BDE0FE", "#CDB4DB", "#FFC8DD"],
  },
  {
    id: "mono",
    label: "Monochrome",
    colors: ["#6B7280", "#6B7280", "#6B7280", "#6B7280", "#6B7280"],
  },
];

// Define the route for generating a graph
router.post("/generate-graph", async (req, res) => {
  const { xvalues, yvalues, graphType, title, colorScheme, options } = req.body;

  if (!xvalues || !yvalues || !graphType) {
    return res
      .status(400)
      .json({ message: "Missing xvalues, yvalues, or graphType!" });
  }

  const width = 800;
  const height = 600;
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  const selectedColorScheme =
    colorSchemes.find((scheme) => scheme.id === colorScheme) || colorSchemes[0];

  const configuration = {
    type: graphType,
    data: {
      labels: xvalues,
      datasets: [
        {
          label: title || "Dataset",
          data: yvalues,
          backgroundColor: selectedColorScheme.colors,
          borderColor: selectedColorScheme.colors.map((color) =>
            color.replace("0.2", "1")
          ),
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: options?.responsive ?? true,
      animation: options?.animation ?? true,
      plugins: {
        title: {
          display: !!title,
          text: title,
          font: { size: 18 },
        },
      },
    },
  };

  try {
    const image = await chartJSNodeCanvas.renderToBuffer(configuration);
    res.setHeader("Content-Type", "image/png");
    res.send(image);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error generating graph" });
  }
});

module.exports = router;
