
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import Stripe from "stripe";

const app = express();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Middleware
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));

// MongoDB Connection with caching
let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@smart-deals.99va52p.mongodb.net/?retryWrites=true&w=majority&appName=smart-deals`;

  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
    maxPoolSize: 10,
    minPoolSize: 5,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 10000,
  });

  await client.connect();
  const db = client.db("lumoraDB");

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

// JWT Verification Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).send({ message: "Unauthorized" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).send({ message: "Unauthorized" });
    req.user = decoded;
    next();
  });
};

// Verify Admin
const verifyAdmin = async (req, res, next) => {
  try {
    const { db } = await connectToDatabase();
    const user = await db
      .collection("users")
      .findOne({ email: req.user.email });
    if (user?.role !== "admin")
      return res.status(403).send({ message: "Forbidden" });
    next();
  } catch (error) {
    res.status(500).send({ message: "Server error" });
  }
};

// Verify Decorator
const verifyDecorator = async (req, res, next) => {
  try {
    const { db } = await connectToDatabase();
    const user = await db
      .collection("users")
      .findOne({ email: req.user.email });
    if (user?.role !== "decorator" && user?.role !== "admin") {
      return res.status(403).send({ message: "Forbidden" });
    }
    next();
  } catch (error) {
    res.status(500).send({ message: "Server error" });
  }
};

// ==================== ROUTES ====================

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date() });
});

// Generate JWT
app.post("/api/jwt", async (req, res) => {
  try {
    const user = req.body;
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: "Error generating token" });
  }
});

// Create User
app.post("/api/users", async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const user = req.body;
    const existing = await db
      .collection("users")
      .findOne({ email: user.email });

    if (existing) {
      return res.json({ message: "User exists", insertedId: null });
    }

    const result = await db.collection("users").insertOne({
      ...user,
      role: "user",
      createdAt: new Date(),
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Error creating user" });
  }
});

// Get User
app.get("/api/users/:email", verifyToken, async (req, res) => {
  try {
    if (req.params.email !== req.user.email) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const { db } = await connectToDatabase();
    const user = await db
      .collection("users")
      .findOne({ email: req.params.email });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Error fetching user" });
  }
});

// Get All Users (Admin)
app.get("/api/users", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const users = await db.collection("users").find().toArray();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Error fetching users" });
  }
});

// Update User Role (Admin)
app.patch("/api/users/:id/role", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const { role, isApproved } = req.body;
    const result = await db
      .collection("users")
      .updateOne(
        { _id: new ObjectId(req.params.id) },
        {
          $set: { role, isApproved: isApproved ?? true, updatedAt: new Date() },
        }
      );
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Error updating role" });
  }
});

// Get Decorators
app.get("/api/decorators", async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const { search } = req.query;
    let query = { role: "decorator", isApproved: true };

    if (search) {
      query.$or = [
        { displayName: { $regex: search, $options: "i" } },
        { specialty: { $regex: search, $options: "i" } },
      ];
    }

    const decorators = await db.collection("users").find(query).toArray();
    res.json(decorators);
  } catch (error) {
    res.status(500).json({ message: "Error fetching decorators" });
  }
});

// Get Services
app.get("/api/services", async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const {
      search,
      category,
      minPrice,
      maxPrice,
      page = 1,
      limit = 12,
      sort,
    } = req.query;

    let query = {};
    if (search) query.$text = { $search: search };
    if (category && category !== "all") query.service_category = category;
    if (minPrice || maxPrice) {
      query.cost = {};
      if (minPrice) query.cost.$gte = parseFloat(minPrice);
      if (maxPrice) query.cost.$lte = parseFloat(maxPrice);
    }

    let sortOptions = {};
    if (sort === "price_asc") sortOptions.cost = 1;
    if (sort === "price_desc") sortOptions.cost = -1;
    if (sort === "newest") sortOptions.createdAt = -1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [services, total] = await Promise.all([
      db
        .collection("services")
        .find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      db.collection("services").countDocuments(query),
    ]);

    res.json({
      services,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching services" });
  }
});

// Get Service by ID
app.get("/api/services/:id", async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const service = await db
      .collection("services")
      .findOne({ _id: new ObjectId(req.params.id) });
    res.json(service);
  } catch (error) {
    res.status(500).json({ message: "Error fetching service" });
  }
});

// Create Service (Admin)
app.post("/api/services", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const service = { ...req.body, createdAt: new Date(), bookingCount: 0 };
    const result = await db.collection("services").insertOne(service);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Error creating service" });
  }
});

// Update Service (Admin)
app.patch("/api/services/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const result = await db
      .collection("services")
      .updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { ...req.body, updatedAt: new Date() } }
      );
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Error updating service" });
  }
});

// Delete Service (Admin)
app.delete("/api/services/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const result = await db
      .collection("services")
      .deleteOne({ _id: new ObjectId(req.params.id) });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Error deleting service" });
  }
});

// Get Service Categories
app.get("/api/service-categories", async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const categories = await db
      .collection("services")
      .distinct("service_category");
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: "Error fetching categories" });
  }
});

// Create Booking
app.post("/api/bookings", verifyToken, async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const booking = {
      ...req.body,
      status: "pending",
      isPaid: false,
      createdAt: new Date(),
    };
    const result = await db.collection("bookings").insertOne(booking);

    await db
      .collection("services")
      .updateOne(
        { _id: new ObjectId(booking.serviceId) },
        { $inc: { bookingCount: 1 } }
      );

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Error creating booking" });
  }
});

// Get User Bookings
app.get("/api/bookings/user/:email", verifyToken, async (req, res) => {
  try {
    if (req.params.email !== req.user.email) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const { db } = await connectToDatabase();
    const { page = 1, limit = 10, sort } = req.query;

    let sortOptions = { createdAt: -1 };
    if (sort === "date_asc") sortOptions = { bookingDate: 1 };
    if (sort === "date_desc") sortOptions = { bookingDate: -1 };

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [bookings, total] = await Promise.all([
      db
        .collection("bookings")
        .find({ userEmail: req.params.email })
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      db.collection("bookings").countDocuments({ userEmail: req.params.email }),
    ]);

    res.json({
      bookings,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching bookings" });
  }
});

// Get Decorator Bookings
app.get(
  "/api/bookings/decorator/:email",
  verifyToken,
  verifyDecorator,
  async (req, res) => {
    try {
      if (req.params.email !== req.user.email) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { db } = await connectToDatabase();
      const bookings = await db
        .collection("bookings")
        .find({ decoratorEmail: req.params.email })
        .sort({ bookingDate: 1 })
        .toArray();
      res.json(bookings);
    } catch (error) {
      res.status(500).json({ message: "Error fetching bookings" });
    }
  }
);

// Get All Bookings (Admin)
app.get("/api/bookings", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const { status, sort } = req.query;

    let query = {};
    if (status && status !== "all") query.status = status;

    let sortOptions = { createdAt: -1 };
    if (sort === "date") sortOptions = { bookingDate: -1 };

    const bookings = await db
      .collection("bookings")
      .find(query)
      .sort(sortOptions)
      .toArray();
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: "Error fetching bookings" });
  }
});

// Get Single Booking
app.get("/api/bookings/:id", verifyToken, async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const booking = await db
      .collection("bookings")
      .findOne({ _id: new ObjectId(req.params.id) });
    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: "Error fetching booking" });
  }
});

// Update Booking
app.patch("/api/bookings/:id", verifyToken, async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const result = await db
      .collection("bookings")
      .updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { ...req.body, updatedAt: new Date() } }
      );
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Error updating booking" });
  }
});

// Assign Decorator (Admin)
app.patch(
  "/api/bookings/:id/assign",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const { db } = await connectToDatabase();
      const { decoratorEmail, decoratorName } = req.body;
      const result = await db
        .collection("bookings")
        .updateOne(
          { _id: new ObjectId(req.params.id) },
          {
            $set: {
              decoratorEmail,
              decoratorName,
              status: "assigned",
              assignedAt: new Date(),
            },
          }
        );
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Error assigning decorator" });
    }
  }
);

// Update Status (Decorator)
app.patch(
  "/api/bookings/:id/status",
  verifyToken,
  verifyDecorator,
  async (req, res) => {
    try {
      const { db } = await connectToDatabase();
      const { status } = req.body;
      const result = await db
        .collection("bookings")
        .updateOne(
          { _id: new ObjectId(req.params.id) },
          { $set: { status, [`statusHistory.${status}`]: new Date() } }
        );
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Error updating status" });
    }
  }
);

// Cancel Booking
app.delete("/api/bookings/:id", verifyToken, async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const booking = await db
      .collection("bookings")
      .findOne({ _id: new ObjectId(req.params.id) });

    if (booking.userEmail !== req.user.email) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (booking.isPaid) {
      return res.status(400).json({ message: "Cannot cancel paid booking" });
    }

    const result = await db
      .collection("bookings")
      .deleteOne({ _id: new ObjectId(req.params.id) });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: "Error cancelling booking" });
  }
});

// Create Checkout Session
app.post("/api/create-checkout-session", verifyToken, async (req, res) => {
  try {
    const { bookingId, amount, serviceName, userEmail } = req.body;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "bdt",
            product_data: {
              name: serviceName,
              description: "Professional Decoration Service",
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}&booking_id=${bookingId}`,
      cancel_url: `${process.env.CLIENT_URL}/payment/cancel?booking_id=${bookingId}`,
      customer_email: userEmail,
      metadata: { bookingId, serviceName },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error("Checkout error:", error);
    res.status(500).json({ message: "Error creating checkout session" });
  }
});

// Verify Payment
app.post("/api/verify-payment", verifyToken, async (req, res) => {
  try {
    const { sessionId, bookingId } = req.body;
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === "paid") {
      const { db } = await connectToDatabase();

      const payment = {
        bookingId,
        userEmail: session.customer_email,
        amount: session.amount_total / 100,
        transactionId: session.payment_intent,
        serviceName: session.metadata.serviceName,
        createdAt: new Date(),
      };

      const paymentResult = await db.collection("payments").insertOne(payment);

      await db
        .collection("bookings")
        .updateOne(
          { _id: new ObjectId(bookingId) },
          {
            $set: {
              isPaid: true,
              paymentId: paymentResult.insertedId.toString(),
              paidAt: new Date(),
            },
          }
        );

      res.json({ success: true, payment });
    } else {
      res
        .status(400)
        .json({ success: false, message: "Payment not completed" });
    }
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error verifying payment" });
  }
});

// Get User Payments
app.get("/api/payments/user/:email", verifyToken, async (req, res) => {
  try {
    if (req.params.email !== req.user.email) {
      return res.status(403).json({ message: "Forbidden" });
    }
    const { db } = await connectToDatabase();
    const payments = await db
      .collection("payments")
      .find({ userEmail: req.params.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: "Error fetching payments" });
  }
});

// Get Decorator Earnings
app.get(
  "/api/payments/decorator/:email",
  verifyToken,
  verifyDecorator,
  async (req, res) => {
    try {
      if (req.params.email !== req.user.email) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { db } = await connectToDatabase();
      const payments = await db
        .collection("payments")
        .find({ decoratorEmail: req.params.email })
        .toArray();
      const totalEarnings = payments.reduce((sum, p) => sum + p.amount, 0);
      res.json({ payments, totalEarnings });
    } catch (error) {
      res.status(500).json({ message: "Error fetching earnings" });
    }
  }
);

// Get All Payments (Admin)
app.get("/api/payments", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { db } = await connectToDatabase();
    const payments = await db
      .collection("payments")
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: "Error fetching payments" });
  }
});

// Analytics (Admin)
app.get(
  "/api/analytics/dashboard",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const { db } = await connectToDatabase();

      const [
        totalRevenue,
        totalBookings,
        paidBookings,
        totalUsers,
        totalDecorators,
        serviceDemand,
        monthlyRevenue,
      ] = await Promise.all([
        db
          .collection("payments")
          .aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }])
          .toArray(),
        db.collection("bookings").countDocuments(),
        db.collection("bookings").countDocuments({ isPaid: true }),
        db.collection("users").countDocuments({ role: "user" }),
        db.collection("users").countDocuments({ role: "decorator" }),
        db
          .collection("bookings")
          .aggregate([
            { $group: { _id: "$serviceName", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 },
          ])
          .toArray(),
        db
          .collection("payments")
          .aggregate([
            {
              $group: {
                _id: {
                  month: { $month: "$createdAt" },
                  year: { $year: "$createdAt" },
                },
                revenue: { $sum: "$amount" },
              },
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } },
          ])
          .toArray(),
      ]);

      res.json({
        totalRevenue: totalRevenue[0]?.total || 0,
        totalBookings,
        paidBookings,
        totalUsers,
        totalDecorators,
        serviceDemand,
        monthlyRevenue,
      });
    } catch (error) {
      console.error("Analytics error:", error);
      res.status(500).json({
        totalRevenue: 0,
        totalBookings: 0,
        paidBookings: 0,
        totalUsers: 0,
        totalDecorators: 0,
        serviceDemand: [],
        monthlyRevenue: [],
      });
    }
  }
);

// Export for Vercel
export default app;
