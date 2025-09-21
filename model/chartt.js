const mongoose = require("mongoose");

// Schema for each chart entry
const chartSchema = new mongoose.Schema(
  {
    serial: {
      type: Number,
      required: true,
    },
    chartDetails: {
      type: Object,
      required: true,
    },
  },
  { _id: false }
); // optional: prevent MongoDB from generating _id for each chart

// User schema with email and charts array
const userChartSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    charts: [chartSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserChart", userChartSchema);
