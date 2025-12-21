import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import Stripe from "stripe";
import cookieParser from "cookie-parser";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      process.env.CLIENT_URL,
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@smart-deals.99va52p.mongodb.net/?appName=smart-deals`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true,
  },
});

// JWT Verification Middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

// Verify Admin
const verifyAdmin = async (req, res, next) => {
  const email = req.user.email;
  const user = await usersCollection.findOne({ email });

  if (user?.role !== "admin") {
    return res.status(403).send({ message: "Forbidden access" });
  }
  next();
};

// Verify Decorator
const verifyDecorator = async (req, res, next) => {
  const email = req.user.email;
  const user = await usersCollection.findOne({ email });

  if (user?.role !== "decorator" && user?.role !== "admin") {
    return res.status(403).send({ message: "Forbidden access" });
  }
  next();
};

let usersCollection;
let servicesCollection;
let bookingsCollection;
let paymentsCollection;
let reviewsCollection;

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

    const database = client.db("lumoraDB");
    usersCollection = database.collection("users");
    servicesCollection = database.collection("services");
    bookingsCollection = database.collection("bookings");
    paymentsCollection = database.collection("payments");
    reviewsCollection = database.collection("reviews");

    // Create indexes
    await servicesCollection.createIndex({
      service_name: "text",
      description: "text",
    });
    await bookingsCollection.createIndex({ userEmail: 1 });
    await bookingsCollection.createIndex({ decoratorEmail: 1 });

    // ==================== AUTH ROUTES ====================

    // Generate JWT
    app.post("/api/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "7d" });
      res.send({ token });
    });

    // ==================== USER ROUTES ====================

    // Create or Update User
    app.post("/api/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
      }

      const result = await usersCollection.insertOne({
        ...user,
        role: "user",
        createdAt: new Date(),
      });
      res.send(result);
    });

    // Get User by Email
    app.get("/api/users/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.user.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const user = await usersCollection.findOne({ email });
      res.send(user);
    });

    // Get All Users (Admin only)
    app.get("/api/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    // Update User Role (Admin only)
    app.patch(
      "/api/users/:id/role",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const { role, isApproved } = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role,
            isApproved: isApproved !== undefined ? isApproved : true,
            updatedAt: new Date(),
          },
        };

        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // Get All Decorators
    app.get("/api/decorators", async (req, res) => {
      const { search } = req.query;
      let query = { role: "decorator", isApproved: true };

      if (search) {
        query.$or = [
          { displayName: { $regex: search, $options: "i" } },
          { specialty: { $regex: search, $options: "i" } },
        ];
      }

      const decorators = await usersCollection.find(query).toArray();
      res.send(decorators);
    });

    // Update Decorator Profile
    app.patch(
      "/api/decorators/:email",
      verifyToken,
      verifyDecorator,
      async (req, res) => {
        const email = req.params.email;
        const updates = req.body;

        if (email !== req.user.email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const filter = { email };
        const updateDoc = {
          $set: {
            ...updates,
            updatedAt: new Date(),
          },
        };

        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // ==================== SERVICE ROUTES ====================

    // Get All Services
    app.get("/api/services", async (req, res) => {
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

      if (search) {
        query.$text = { $search: search };
      }

      if (category && category !== "all") {
        query.service_category = category;
      }

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

      const services = await servicesCollection
        .find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      const total = await servicesCollection.countDocuments(query);

      res.send({
        services,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
      });
    });

    // Get Service by ID
    app.get("/api/services/:id", async (req, res) => {
      const id = req.params.id;
      const service = await servicesCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(service);
    });

    // Create Service (Admin only)
    app.post("/api/services", verifyToken, verifyAdmin, async (req, res) => {
      const service = {
        ...req.body,
        createdAt: new Date(),
        bookingCount: 0,
      };

      const result = await servicesCollection.insertOne(service);
      res.send(result);
    });

    // Update Service (Admin only)
    app.patch(
      "/api/services/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const updates = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            ...updates,
            updatedAt: new Date(),
          },
        };

        const result = await servicesCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // Delete Service (Admin only)
    app.delete(
      "/api/services/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const result = await servicesCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      }
    );

    // Get Service Categories
    app.get("/api/service-categories", async (req, res) => {
      const categories = await servicesCollection.distinct("service_category");
      res.send(categories);
    });

    // ==================== BOOKING ROUTES ====================

    // Create Booking
    app.post("/api/bookings", verifyToken, async (req, res) => {
      const booking = {
        ...req.body,
        status: "pending",
        isPaid: false,
        createdAt: new Date(),
      };

      const result = await bookingsCollection.insertOne(booking);

      // Increment booking count for service
      await servicesCollection.updateOne(
        { _id: new ObjectId(booking.serviceId) },
        { $inc: { bookingCount: 1 } }
      );

      res.send(result);
    });

    // Get User Bookings
    app.get("/api/bookings/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const { page = 1, limit = 10, sort } = req.query;

      if (email !== req.user.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      let sortOptions = { createdAt: -1 };
      if (sort === "date_asc") sortOptions = { bookingDate: 1 };
      if (sort === "date_desc") sortOptions = { bookingDate: -1 };

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const bookings = await bookingsCollection
        .find({ userEmail: email })
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .toArray();

      const total = await bookingsCollection.countDocuments({
        userEmail: email,
      });

      res.send({
        bookings,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
      });
    });

    // Get Decorator Bookings
    app.get(
      "/api/bookings/decorator/:email",
      verifyToken,
      verifyDecorator,
      async (req, res) => {
        const email = req.params.email;

        if (email !== req.user.email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const bookings = await bookingsCollection
          .find({ decoratorEmail: email })
          .sort({ bookingDate: 1 })
          .toArray();

        res.send(bookings);
      }
    );

    // Get All Bookings (Admin only)
    app.get("/api/bookings", verifyToken, verifyAdmin, async (req, res) => {
      const { status, sort } = req.query;

      let query = {};
      if (status && status !== "all") {
        query.status = status;
      }

      let sortOptions = { createdAt: -1 };
      if (sort === "date") sortOptions = { bookingDate: -1 };

      const bookings = await bookingsCollection
        .find(query)
        .sort(sortOptions)
        .toArray();
      res.send(bookings);
    });

    // Get Single Booking
    app.get("/api/bookings/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const booking = await bookingsCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(booking);
    });

    // Update Booking
    app.patch("/api/bookings/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updates = req.body;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      };

      const result = await bookingsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Assign Decorator (Admin only)
    app.patch(
      "/api/bookings/:id/assign",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const { decoratorEmail, decoratorName } = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            decoratorEmail,
            decoratorName,
            status: "assigned",
            assignedAt: new Date(),
          },
        };

        const result = await bookingsCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // Update Project Status (Decorator)
    app.patch(
      "/api/bookings/:id/status",
      verifyToken,
      verifyDecorator,
      async (req, res) => {
        const id = req.params.id;
        const { status } = req.body;

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status,
            [`statusHistory.${status}`]: new Date(),
          },
        };

        const result = await bookingsCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // Cancel Booking
    app.delete("/api/bookings/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const booking = await bookingsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (booking.userEmail !== req.user.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      if (booking.isPaid) {
        return res.status(400).send({
          message: "Cannot cancel paid booking. Please contact support.",
        });
      }

      const result = await bookingsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // ==================== PAYMENT ROUTES ====================

    // Create Payment Intent
    app.post("/api/create-payment-intent", verifyToken, async (req, res) => {
      const { amount } = req.body;
      const amountInCents = Math.round(amount * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: "bdt",
        payment_method_types: ["card"],
      });

      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // Save Payment
    app.post("/api/payments", verifyToken, async (req, res) => {
      const payment = {
        ...req.body,
        createdAt: new Date(),
      };

      const result = await paymentsCollection.insertOne(payment);

      // Update booking payment status
      await bookingsCollection.updateOne(
        { _id: new ObjectId(payment.bookingId) },
        {
          $set: {
            isPaid: true,
            paymentId: result.insertedId.toString(),
            paidAt: new Date(),
          },
        }
      );

      res.send(result);
    });

    // Get User Payments
    app.get("/api/payments/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.user.email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const payments = await paymentsCollection
        .find({ userEmail: email })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(payments);
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
                unit_amount: Math.round(amount * 100), // Convert to cents
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}&booking_id=${bookingId}`,
          cancel_url: `${process.env.CLIENT_URL}/payment/cancel?booking_id=${bookingId}`,
          customer_email: userEmail,
          metadata: {
            bookingId: bookingId,
            serviceName: serviceName,
          },
        });

        res.send({ sessionId: session.id, url: session.url });
      } catch (error) {
        console.error("Checkout session error:", error);
        res.status(500).send({ message: "Failed to create checkout session" });
      }
    });

    // Verify Payment and Update Booking
    app.post("/api/verify-payment", verifyToken, async (req, res) => {
      try {
        const { sessionId, bookingId } = req.body;

        // Retrieve the session from Stripe
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === "paid") {
          // Save payment record
          const payment = {
            bookingId,
            userEmail: session.customer_email,
            amount: session.amount_total / 100,
            transactionId: session.payment_intent,
            serviceName: session.metadata.serviceName,
            createdAt: new Date(),
          };

          const paymentResult = await paymentsCollection.insertOne(payment);

          // Update booking
          await bookingsCollection.updateOne(
            { _id: new ObjectId(bookingId) },
            {
              $set: {
                isPaid: true,
                paymentId: paymentResult.insertedId.toString(),
                paidAt: new Date(),
              },
            }
          );

          res.send({ success: true, payment });
        } else {
          res
            .status(400)
            .send({ success: false, message: "Payment not completed" });
        }
      } catch (error) {
        console.error("Payment verification error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to verify payment" });
      }
    });

    // Get Decorator Earnings
    app.get(
      "/api/payments/decorator/:email",
      verifyToken,
      verifyDecorator,
      async (req, res) => {
        const email = req.params.email;

        if (email !== req.user.email) {
          return res.status(403).send({ message: "Forbidden access" });
        }

        const payments = await paymentsCollection
          .find({ decoratorEmail: email })
          .toArray();

        const totalEarnings = payments.reduce((sum, p) => sum + p.amount, 0);

        res.send({ payments, totalEarnings });
      }
    );

    // Get All Payments (Admin only)
    app.get("/api/payments", verifyToken, verifyAdmin, async (req, res) => {
      const payments = await paymentsCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();
      res.send(payments);
    });

    // ==================== ANALYTICS ROUTES (Admin) ====================

    app.get(
      "/api/analytics/dashboard",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        try {
          const totalRevenue = await paymentsCollection
            .aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }])
            .toArray();

          const totalBookings = await bookingsCollection.countDocuments();
          const paidBookings = await bookingsCollection.countDocuments({
            isPaid: true,
          });
          const totalUsers = await usersCollection.countDocuments({
            role: "user",
          });
          const totalDecorators = await usersCollection.countDocuments({
            role: "decorator",
          });

          // Service demand chart data - FIXED to use serviceName directly
          const serviceDemand = await bookingsCollection
            .aggregate([
              {
                $group: {
                  _id: "$serviceName",
                  count: { $sum: 1 },
                },
              },
              { $sort: { count: -1 } },
              { $limit: 10 },
            ])
            .toArray();

          // Monthly revenue
          const monthlyRevenue = await paymentsCollection
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
            .toArray();

          res.send({
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
          res.status(500).send({
            message: "Error fetching analytics",
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

    // ==================== REVIEW ROUTES ====================

    app.post("/api/reviews", verifyToken, async (req, res) => {
      const review = {
        ...req.body,
        createdAt: new Date(),
      };

      const result = await reviewsCollection.insertOne(review);
      res.send(result);
    });

    app.get("/api/reviews/service/:serviceId", async (req, res) => {
      const serviceId = req.params.serviceId;
      const reviews = await reviewsCollection
        .find({ serviceId })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(reviews);
    });

    // Health check
    app.get("/health", (req, res) => {
      res.send({ status: "OK", timestamp: new Date() });
    });
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Lumora Server is running");
});

// app.listen(port, () => {
//   console.log(`Lumora server running on port ${port}`);
// });
