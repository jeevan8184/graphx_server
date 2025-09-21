const mongoose = require("mongoose");
const { Schema } = mongoose;
const validator = require("validator");
const bcrypt = require("bcryptjs");

const subscriptionSchema = new Schema(
  {
    plan: {
      type: String,
      enum: [null, "professional", "enterprise"],
      default: null,
    },
    active: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
    },
    paymentMethod: {
      type: String,
      enum: ["razorpay", "stripe", "manual"],
      default: "razorpay",
    },
  },
  { _id: false }
); // Add this to prevent separate _id for subdocument

const paymentSchema = new Schema(
  {
    paymentId: String,
    orderId: String,
    amount: Number,
    currency: {
      type: String,
      default: "INR",
    },
    date: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },
  },
  { _id: false }
); // Add this to prevent separate _id for subdocument

const userSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: validator.isEmail,
      message: "Invalid email format",
    },
  },
  password: {
    type: String,
    minlength: 8,
    select: false,
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  displayName: {
    type: String,
    trim: true,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  lastLogin: {
    type: Date,
  },
  subscription: {
    type: subscriptionSchema,
    default: () => ({}), // This ensures subscription is never undefined
  },
  payments: {
    type: [paymentSchema],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to update subscription
userSchema.methods.updateSubscription = async function (
  plan,
  durationMonths = 1
) {
  // Initialize subscription if it doesn't exist
  if (!this.subscription) {
    this.subscription = {};
  }

  this.subscription.plan = plan;
  this.subscription.active = true;

  const expirationDate = new Date();
  expirationDate.setMonth(expirationDate.getMonth() + durationMonths);
  this.subscription.expiresAt = expirationDate;

  await this.save();
  return this;
};

// Method to cancel subscription
userSchema.methods.cancelSubscription = async function () {
  if (!this.subscription) {
    this.subscription = {};
  }
  this.subscription.active = false;
  await this.save();
  return this;
};

// Static method to check subscription status
userSchema.statics.checkSubscription = async function (userId) {
  const user = await this.findById(userId).select("subscription");

  if (!user) {
    throw new Error("User not found");
  }

  // Initialize subscription if it doesn't exist
  if (!user.subscription) {
    user.subscription = {
      plan: null,
      active: false,
      expiresAt: null,
      paymentMethod: "razorpay",
    };
    await user.save();
  }

  // Check if subscription is expired
  if (user.subscription.active && user.subscription.expiresAt < new Date()) {
    user.subscription.active = false;
    await user.save();
  }

  return user.subscription;
};

const User = mongoose.model("User", userSchema);

module.exports = User;
