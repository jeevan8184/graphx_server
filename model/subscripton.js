const mongoose = require("mongoose");
const { Schema } = mongoose;

const paymentSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  plan: {
    type: String,
    enum: ["professional", "enterprise"],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  currency: {
    type: String,
    default: "INR",
  },
  razorpayPaymentId: {
    type: String,
  },
  razorpayOrderId: {
    type: String,
    required: true,
    unique: true, // This creates the index automatically
  },
  razorpaySignature: {
    type: String,
  },
  status: {
    type: String,
    enum: ["created", "attempted", "paid", "failed", "refunded"],
    default: "created",
  },
  metadata: {
    type: Schema.Types.Mixed,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Remaining indexes (without the duplicate razorpayOrderId)
paymentSchema.index({ userId: 1 });
paymentSchema.index({ razorpayPaymentId: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ createdAt: 1 });

// Update timestamp before saving
paymentSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const Payment = mongoose.model("Payment", paymentSchema);

module.exports = Payment;
