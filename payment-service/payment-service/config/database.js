const { MongoClient } = require('mongodb');

const dbConfig = {
     host: process.env.DB_HOST || 'mongodb-payment',
     port: process.env.DB_PORT || 27017,
     database: process.env.DB_NAME || 'payment_db'
};

let client;
let db;

const init = async () => {
     try {
          const connectionString = `mongodb://${dbConfig.host}:${dbConfig.port}`;
          client = new MongoClient(connectionString);
          await client.connect();
          db = client.db(dbConfig.database);

          // Initialize indexes
          await initializeIndexes();
          console.log('Payment database initialized successfully');
     } catch (error) {
          console.error('Database initialization error:', error);
          throw error;
     }
};

const initializeIndexes = async () => {
     try {
          // Create indexes for payments collection
          const paymentsCollection = db.collection('payments');
          await paymentsCollection.createIndex({ trip_id: 1 });
          await paymentsCollection.createIndex({ rider_id: 1 });
          await paymentsCollection.createIndex({ status: 1 });
          await paymentsCollection.createIndex({ idempotency_key: 1 }, { unique: true, sparse: true });
          await paymentsCollection.createIndex({ transaction_id: 1 }, { unique: true, sparse: true });
          await paymentsCollection.createIndex({ created_at: -1 });
          await paymentsCollection.createIndex({ _id: 1 });

          // Create indexes for receipts collection
          const receiptsCollection = db.collection('receipts');
          await receiptsCollection.createIndex({ payment_id: 1 });
          await receiptsCollection.createIndex({ receipt_number: 1 }, { unique: true });
          await receiptsCollection.createIndex({ _id: 1 });

          console.log('Indexes created successfully');
     } catch (error) {
          console.error('Error creating indexes:', error);
          throw error;
     }
};

const getDb = () => {
     if (!db) {
          throw new Error('Database not initialized');
     }
     return db;
};

const getClient = () => {
     if (!client) {
          throw new Error('MongoDB client not initialized');
     }
     return client;
};

module.exports = {
     init,
     getDb,
     getClient
};
