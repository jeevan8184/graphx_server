const dotenv = require("dotenv").config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const LocalStrategy = require("passport-local").Strategy;
const mongoose = require("mongoose");
const MongoStore = require("connect-mongo");
const chartRoutes = require("./route/Fetch");
const cors = require("cors");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const morgan = require("morgan");
const validator = require("validator");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const graphRouter = require("./graph");
// Import models
const User = require("./model/user");
const Payment = require("./model/subscripton");

// Initialize Express app
const app = express();

// Enhanced security middleware
app.use(helmet());
app.use(morgan("dev"));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later",
});
app.use(limiter);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration - allow all origins with credentials
const corsOptions = {
  origin: (origin, callback) => {
    callback(null, true); // allow all origins
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));


// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Mail Sender Component
const sendLoginNotificationEmail = async (user) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM}" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: "Successful Login to Graph-X",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4a6baf;">Hello ${
          user.displayName || user.email.split("@")[0]
        }!</h2>
        <p>You have successfully logged in to your Graph-X account.</p>
        <p>Thank you for using our service. If this wasn't you, please secure your account immediately.</p>
        <p style="margin-top: 30px;">Best regards,</p>
        <p><strong>The Graph-X Team</strong></p>
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
          <small style="color: #888;">This is an automated message - please do not reply directly to this email.</small>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Login notification email sent to ${user.email}`);
  } catch (error) {
    console.error("Error sending login notification email:", error);
  }
};

const sendPaymentConfirmationEmail = async (user, paymentDetails) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const planName =
    paymentDetails.plan === "professional" ? "Professional" : "Enterprise";
  const amount = (paymentDetails.amount / 100).toFixed(2);
  const expiryDate = new Date(paymentDetails.expiresAt).toLocaleDateString(
    "en-IN",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM}" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: `Payment Confirmation for Graph-X ${planName} Plan`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background-color: #4a6baf; padding: 20px; color: white; text-align: center;">
          <h1>Payment Successful!</h1>
        </div>
        
        <div style="padding: 20px;">
          <p>Hello ${user.displayName || user.email.split("@")[0]},</p>
          
          <p>Thank you for subscribing to the Graph-X <strong>${planName}</strong> plan. 
          Your payment of <strong>₹${amount}</strong> has been successfully processed.</p>
          
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Subscription Details</h3>
            <p><strong>Plan:</strong> ${planName}</p>
            <p><strong>Amount Paid:</strong> ₹${amount}</p>
            <p><strong>Subscription Active Until:</strong> ${expiryDate}</p>
            <p><strong>Payment Method:</strong> Razorpay</p>
          </div>
          
          <p>You can now access all the premium features of Graph-X. If you have any questions about your subscription, 
          please don't hesitate to contact our support team.</p>
          
          <p style="margin-top: 30px;">Best regards,</p>
          <p><strong>The Graph-X Team</strong></p>
          
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #777;">
            <p>This is an automated message - please do not reply directly to this email.</p>
            <p>Payment ID: ${paymentDetails.razorpayPaymentId}</p>
          </div>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Payment confirmation email sent to ${user.email}`);
  } catch (error) {
    console.error("Error sending payment confirmation email:", error);
  }
};

const sendPlanSwitchEmail = async (user, switchDetails) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const planNames = {
    professional: "Professional",
    enterprise: "Enterprise",
  };

  const amount = (switchDetails.amount / 100).toFixed(2);
  const expiryDate = new Date(switchDetails.expiresAt).toLocaleDateString(
    "en-IN",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM}" <${process.env.EMAIL_USER}>`,
    to: user.email,
    subject: `Plan Changed to Graph-X ${planNames[switchDetails.newPlan]}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background-color: #4a6baf; padding: 20px; color: white; text-align: center;">
          <h1>Plan Change Confirmation</h1>
        </div>
        
        <div style="padding: 20px;">
          <p>Hello ${user.displayName || user.email.split("@")[0]},</p>
          
          <p>Your Graph-X subscription has been changed from 
          <strong>${
            planNames[switchDetails.previousPlan] || "Free"
          }</strong> to 
          <strong>${planNames[switchDetails.newPlan]}</strong> plan.</p>
          
          ${
            switchDetails.amount > 0
              ? `
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Payment Details</h3>
            <p><strong>Amount Paid:</strong> ₹${amount}</p>
            <p><strong>Payment ID:</strong> ${switchDetails.razorpayPaymentId}</p>
          </div>
          `
              : ""
          }
          
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0;">New Subscription Details</h3>
            <p><strong>Plan:</strong> ${planNames[switchDetails.newPlan]}</p>
            <p><strong>Active Until:</strong> ${expiryDate}</p>
          </div>
          
          <p>You now have access to all features of your new plan. If you have any questions, 
          please contact our support team.</p>
          
          <p style="margin-top: 30px;">Best regards,</p>
          <p><strong>The Graph-X Team</strong></p>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Plan switch email sent to ${user.email}`);
  } catch (error) {
    console.error("Error sending plan switch email:", error);
  }
};
//cruds for mongo

// MongoDB connection
const connectDB = async () => {
  try {
    console.log("Attempting to connect to MongoDB Atlas...");
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName:"GraphX",
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    });

    mongoose.connection.on("connected", () => {
      console.log("Mongoose connected to MongoDB Atlas");
    });

    mongoose.connection.on("error", (err) => {
      console.error("Mongoose connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.log("Mongoose disconnected from MongoDB Atlas");
    });

    console.log("Successfully connected to MongoDB Atlas!");
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  }
};

// Connect to MongoDB
connectDB();

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      collectionName: "sessions",
      ttl: 24 * 60 * 60, // 1 day
      autoRemove: "native",
    }),
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Local Strategy
passport.use(
  new LocalStrategy(
    { usernameField: "email" },
    async (email, password, done) => {
      try {
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
          return done(null, false, { message: "Incorrect email or password" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return done(null, false, { message: "Incorrect email or password" });
        }

        user.lastLogin = new Date();
        await user.save();

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

// Google Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      passReqToCallback: true,
      scope: ["profile", "email"],
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        if (!profile.emails || !profile.emails[0]) {
          return done(new Error("No email found in Google profile"));
        }

        const email = profile.emails[0].value.toLowerCase();
        const displayName = profile.displayName || email.split("@")[0];

        let user = await User.findOne({
          $or: [{ email }, { googleId: profile.id }],
        });

        if (!user) {
          user = new User({
            email,
            googleId: profile.id,
            displayName,
            isVerified: true,
            subscription: { active: false, plan: null },
          });
          await user.save();
        } else if (!user.googleId) {
          user.googleId = profile.id;
          if (!user.displayName) {
            user.displayName = displayName;
          }
          user.isVerified = true;
          await user.save();
        }

        return done(null, user);
      } catch (err) {
        console.error("Google authentication error:", err);
        return done(err);
      }
    }
  )
);

// Passport serialization/deserialization
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Helper function to calculate plan switch amounts
function calculateSwitchAmount(currentPlan, newPlan, currentExpiry) {
  const now = new Date();
  const monthlyPrices = {
    professional: 700, // ₹700/month for professional
    enterprise: 1499, // ₹799/month for enterprise (your required price)
  };

  // If no current plan or expired, treat as new subscription
  if (!currentPlan || !currentExpiry || new Date(currentExpiry) <= now) {
    return {
      amountDue: monthlyPrices[newPlan],
      newExpiry: new Date(
        new Date().setMonth(
          now.getMonth() + (newPlan === "professional" ? 1 : 12)
        )
      ),
    };
  }

  // For upgrades, charge flat difference (₹799 - ₹700 = ₹99)
  if (newPlan === "enterprise" && currentPlan === "professional") {
    return {
      amountDue: 799, // ₹799 - ₹700 = ₹99 upgrade fee
      newExpiry: new Date(currentExpiry), // Keep same expiry
    };
  }

  // Calculate remaining time in months (prorated)
  const remainingMs = new Date(currentExpiry) - now;
  const remainingDays = remainingMs / (1000 * 60 * 60 * 24);
  const remainingMonths = remainingDays / 30; // Approximation

  // Calculate remaining value of current plan
  const remainingValue = remainingMonths * monthlyPrices[currentPlan];

  // Calculate cost of new plan for remaining duration
  const newPlanCost = remainingMonths * monthlyPrices[newPlan];

  // Determine amount due
  let amountDue = newPlanCost - remainingValue;

  // Calculate new expiry date
  let newExpiry = new Date(currentExpiry); // Default to current expiry

  // Special case: If switching to enterprise, ensure minimum ₹99 charge
  if (newPlan === "enterprise" && amountDue < 799) {
    amountDue = 799;
  }

  return {
    amountDue: Math.max(0, amountDue), // Never negative
    newExpiry: newExpiry,
  };
}
// Routes
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to Graph-X API",
    status: "running",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// Auth status endpoint
app.get("/auth/status", (req, res) => {
  if (req.isAuthenticated()) {
    return res.json({
      isAuthenticated: true,
      user: {
        id: req.user._id,
        email: req.user.email,
        name: req.user.displayName || req.user.email.split("@")[0],
        isVerified: req.user.isVerified,
      },
    });
  }
  res.json({ isAuthenticated: false, user: null });
});

// Subscription endpoints
app.get("/api/subscription", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
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

    res.json({
      success: true,
      subscription: user.subscription,
      subscriptionActive: user.subscription.active,
      plan: user.subscription.plan,
    });
  } catch (err) {
    console.error("Subscription fetch error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch subscription",
      error: err.message,
    });
  }
});

// Payment endpoints
app.post("/api/payment/create-order", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const { plan } = req.body;
    if (!["professional", "enterprise"].includes(plan)) {
      return res.status(400).json({ success: false, message: "Invalid plan" });
    }

    const amount = plan === "professional" ? 70000 : 149900; // in paise
    const receipt = `rcpt-${Date.now().toString().slice(-8)}-${req.user._id
      .toString()
      .slice(-8)}`;

    const options = {
      amount,
      currency: "INR",
      receipt,
      notes: {
        userId: req.user._id.toString(),
        plan,
        email: req.user.email,
      },
      payment_capture: 1,
    };

    const order = await razorpay.orders.create(options);

    // Create payment record in database
    const payment = new Payment({
      userId: req.user._id,
      plan,
      amount: amount / 100, // convert to rupees
      razorpayOrderId: order.id,
      status: "created",
    });
    await payment.save();

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      name: "Graph-X",
      description: `Graph-X ${
        plan.charAt(0).toUpperCase() + plan.slice(1)
      } Plan`,
      prefill: {
        name: req.user.displayName || req.user.email.split("@")[0],
        email: req.user.email,
      },
    });
  } catch (err) {
    console.error("Payment error:", {
      status: err.statusCode,
      error: err.error?.description || err.message,
    });

    res.status(500).json({
      success: false,
      message: "Payment processing failed",
      error: err.error?.description || err.message,
    });
  }
});

app.post("/api/payment/verify", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } =
      req.body;

    // Verify the payment signature
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature" });
    }

    // Fetch the order details
    const order = await razorpay.orders.fetch(razorpay_order_id);
    const userId = order.notes.userId;
    const plan = order.notes.plan;

    // Update payment record
    const payment = await Payment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        status: "paid",
        metadata: order,
      },
      { new: true }
    );

    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment record not found" });
    }

    // Update user subscription
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Initialize subscription if it doesn't exist
    if (!user.subscription) {
      user.subscription = {
        plan: null,
        active: false,
        expiresAt: null,
        paymentMethod: "razorpay",
      };
    }

    // Duration based on plan (1 month for professional, 12 months for enterprise)
    const durationMonths = plan === "professional" ? 1 : 12;
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

    // Update subscription
    user.subscription = {
      plan,
      active: true,
      expiresAt,
      paymentMethod: "razorpay",
    };

    // Add payment to user's payment history
    user.payments = user.payments || [];
    user.payments.push({
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      amount: order.amount / 100, // convert to rupees
      status: "completed",
    });

    await user.save();

    // Send payment confirmation email
    await sendPaymentConfirmationEmail(user, {
      plan,
      amount: order.amount,
      expiresAt,
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
    });

    res.json({
      success: true,
      message: "Payment verified and subscription updated",
      subscription: user.subscription,
      payment,
    });
  } catch (err) {
    console.error("Payment verification error:", err);
    res.status(500).json({
      success: false,
      message: "Payment verification failed",
      error: err.message,
    });
  }
});

// Plan switching endpoints
app.post("/api/payment/switch-plan", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const { newPlan, currentPlan } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Validate plans
    if (!["professional", "enterprise"].includes(newPlan)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid new plan" });
    }

    if (user.subscription?.plan === newPlan) {
      return res.status(400).json({
        success: false,
        message: "You already have this plan",
      });
    }

    // Calculate prorated amount due
    const { amountDue, newExpiry } = calculateSwitchAmount(
      currentPlan,
      newPlan,
      user.subscription?.expiresAt
    );

    // Convert to integer (paise)
    const amountInPaise = Math.round(amountDue * 100);

    // For debugging - log the calculation
    console.log(`Plan switch calculation:
      From: ${currentPlan} (${user.subscription?.expiresAt})
      To: ${newPlan}
      Amount Due: ₹${amountDue} (${amountInPaise} paise)
      New Expiry: ${newExpiry}`);

    if (amountInPaise <= 0) {
      // No payment needed (downgrade or credit covers cost)
      user.subscription = {
        plan: newPlan,
        active: true,
        expiresAt: newExpiry,
        paymentMethod: "razorpay",
      };
      await user.save();

      await sendPlanSwitchEmail(user, {
        newPlan,
        previousPlan: currentPlan,
        amount: 0,
        expiresAt: newExpiry,
        razorpayPaymentId: null,
      });

      return res.json({
        success: true,
        requiresPayment: false,
        subscription: user.subscription,
        message: "Plan switched successfully",
      });
    }

    // Create payment order for the amount due
    const receipt = `switch-${Date.now().toString().slice(-8)}-${user._id
      .toString()
      .slice(-8)}`;

    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt,
      notes: {
        userId: user._id.toString(),
        plan: newPlan,
        email: user.email,
        isSwitch: true,
        currentPlan,
        newExpiry: newExpiry.toISOString(),
      },
      payment_capture: 1,
    };

    const order = await razorpay.orders.create(options);

    // Create payment record
    const payment = new Payment({
      userId: user._id,
      plan: newPlan,
      amount: amountDue,
      razorpayOrderId: order.id,
      status: "created",
      isSwitch: true,
      previousPlan: currentPlan,
    });
    await payment.save();

    res.json({
      success: true,
      requiresPayment: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      newExpiry,
    });
  } catch (err) {
    console.error("Plan switch error:", err);
    res.status(500).json({
      success: false,
      message: "Plan switch failed",
      error: err.error?.description || err.message,
    });
  }
});

app.post("/api/payment/verify-switch", async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated" });
    }

    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      newPlan,
    } = req.body;

    // Verify the payment signature
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature" });
    }

    // Fetch the order details
    const order = await razorpay.orders.fetch(razorpay_order_id);
    const userId = order.notes.userId;
    const plan = order.notes.plan;
    const isSwitch = order.notes.isSwitch === "true";
    const currentPlan = order.notes.currentPlan;

    // Update payment record
    const payment = await Payment.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        status: "paid",
        metadata: order,
      },
      { new: true }
    );

    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment record not found" });
    }

    // Update user subscription
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Calculate new expiry date based on order notes or calculate fresh
    let expiresAt;
    if (order.notes.newExpiry) {
      expiresAt = new Date(order.notes.newExpiry);
    } else {
      const durationMonths = plan === "professional" ? 1 : 12;
      expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + durationMonths);
    }

    // Update subscription
    user.subscription = {
      plan,
      active: true,
      expiresAt,
      paymentMethod: "razorpay",
    };

    // Add payment to history
    user.payments = user.payments || [];
    user.payments.push({
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      amount: order.amount / 100,
      status: "completed",
      isSwitch: true,
      previousPlan: currentPlan,
    });

    await user.save();

    // Send confirmation email
    await sendPlanSwitchEmail(user, {
      newPlan: plan,
      previousPlan: currentPlan,
      amount: order.amount,
      expiresAt,
      razorpayPaymentId: razorpay_payment_id,
    });

    res.json({
      success: true,
      message: "Plan switched successfully",
      subscription: user.subscription,
    });
  } catch (err) {
    console.error("Switch verification error:", err);
    res.status(500).json({
      success: false,
      message: "Plan switch verification failed",
      error: err.message,
    });
  }
});

// Payment status check
app.get("/api/payment/status", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res
      .status(401)
      .json({ success: false, message: "Not authenticated" });
  }

  try {
    const { orderId } = req.query;

    if (!orderId) {
      return res
        .status(400)
        .json({ success: false, message: "Order ID required" });
    }

    const order = await razorpay.orders.fetch(orderId);
    const payment = await razorpay.payments.fetch(orderId);

    res.json({
      success: true,
      paid: payment.status === "captured",
      order,
      payment,
    });
  } catch (err) {
    console.error("Payment status check error:", err);
    res.status(500).json({
      success: false,
      message: "Payment status check failed",
      error: err.message,
    });
  }
});

// Auth routes
app.post("/login", passport.authenticate("local"), async (req, res) => {
  try {
    sendLoginNotificationEmail(req.user);
    res.json({
      success: true,
      user: {
        id: req.user._id,
        email: req.user.email,
        name: req.user.displayName || req.user.email.split("@")[0],
        isVerified: req.user.isVerified,
      },
    });
  } catch (err) {
    console.error("Login processing error:", err);
    res.status(500).json({ success: false, message: "Error processing login" });
  }
});

app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login-failure",
    session: true,
  }),
  async (req, res) => {
    try {
      sendLoginNotificationEmail(req.user);
      const redirectUrl = process.env.FRONTEND_URL;
      res.redirect(`${redirectUrl}/dashboard?login_success=true`);
    } catch (err) {
      console.error("Google callback processing error:", err);
      const redirectUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      res.redirect(`${redirectUrl}/login?error=google_auth_failed`);
    }
  }
);

app.post("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie("connect.sid");
      res.json({ success: true, message: "Logged out successfully" });
    });
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err.stack);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app
  .listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  })
  .on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `Port ${PORT} is in use. Trying port ${Number(PORT) + 1}...`
      );
      app.listen(Number(PORT) + 1);
    } else {
      console.error("Server startup error:", err);
      process.exit(1);
    }
  });
app.use("/chartRoutes", chartRoutes);
app.use("/ap", graphRouter);
// Graceful shutdown
process.on("SIGINT", async () => {
  await mongoose.connection.close();
  server.close(() => {
    console.log("Server and MongoDB connection closed");
    process.exit(0);
  });
});
