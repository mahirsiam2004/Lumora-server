require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const database = client.db("lumoraDB");
    usersCollection = database.collection("users");
    servicesCollection = database.collection("services");
    bookingsCollection = database.collection("bookings");
    paymentsCollection = database.collection("payments");
    reviewsCollection = database.collection("reviews");

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



  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("server is  working");
});

    app.post("/api/services", verifyToken, verifyAdmin, async (req, res) => {
      const service = {
        ...req.body,
        createdAt: new Date(),
        bookingCount: 0,
      };

      const result = await servicesCollection.insertOne(service);
      res.send(result);
    });

app.listen(port, () => {
  console.log(`port is running on ${port}`);
});
