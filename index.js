require('dotenv').config()
const express = require('express');
const cors = require('cors')

const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser');

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

// Middleware:
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://job-portal-1e46d.web.app',
    'https://job-portal-1e46d.firebaseapp.com',
  ],
  credentials: true
}));

app.use(express.json())
app.use(cookieParser())

// const logger = (req, res, next) => {
//   console.log("Output One.");
//   next()
// }

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: 'Unauthorized Access.' })
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decode) => {
    if (err) {
      return res.status(401).send({ message: 'UnAuthorized Access.' })
    }
    req.user = decode
    next()
  })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.p62hq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    // Create db and collection :
    const jobsCollection = client.db("jobPortal").collection("jobs");
    const jobApplicationCollection = client.db('jobPortal').collection('jobApplications')

    // Auth Related APIs:
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });

      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    app.post('/logout', (req, res) => {
      res.clearCookie('token',
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true })
    })

    // Jobs related apis:
    app.get("/jobs", async (req, res) => {
      // For getting my posted Jobs only
      const email = req.query.email
      let query = {}
      if (email) {
        query = { hr_email: email };
      }

      const result = await jobsCollection.find(query).toArray()
      res.send(result);
    })

    app.post("/jobs", async (req, res) => {
      const newJob = req.body;
      const result = await jobsCollection.insertOne(newJob)
      res.send(result)
    })

    // Find single job based on id:
    app.get("/jobs/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.findOne(query)
      res.send(result)
    })

    // Job Applications:
    app.get('/job-applications', verifyToken, async (req, res) => {
      const email = req.query.email
      const query = { application_email: email }

      // req.user.email  = Token Email
      //req.query.email  = Query Email (Je email diye user login korse.)
      if (req.user.email !== req.query.email) {
        return res.status(403).send({ message: 'Forbidden Access.' })
      }
      console.log("My cookie: ", req.cookies);

      const result = await jobApplicationCollection.find(query).toArray();

      // Not recommended:
      for (const application of result) {
        // console.log(application.job_id);

        const query1 = { _id: new ObjectId(application.job_id) }
        const job = await jobsCollection.findOne(query1)

        if (job) {
          application.title = job.title;
          application.company = job.company;
          application.location = job.location;
          application.company_logo = job.company_logo

        }
      };

      res.send(result)
    })

    app.get('/job-applications/jobs/:job_id', async (req, res) => {
      const jobId = req.params.job_id
      const query = { job_id: jobId }
      const result = await jobApplicationCollection.find(query).toArray()
      res.send(result)
    })

    app.post("/job-applications", async (req, res) => {
      const application = req.body;
      const result = await jobApplicationCollection.insertOne(application)

      // Not Recommended:
      // 1
      const id = application.job_id
      const query = { _id: new ObjectId(id) }
      const job = await jobsCollection.findOne(query)
      console.log(job);

      let newCount = 0;
      if (job.applicationCount) {
        newCount = job.applicationCount + 1;
      }
      else {
        newCount = 1;
      }

      // 2
      // Now update the job info:
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          applicationCount: newCount
        }
      }

      const updateResult = await jobsCollection.updateOne(filter, updateDoc)

      res.send(result)
    })

    app.patch("/job-applications/:id", async (req, res) => {
      const id = req.params.id
      const data = req.body

      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          status: data.status
        }
      }
      const result = await jobApplicationCollection.updateOne(filter, updateDoc)
      res.send(result)
    })


  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
