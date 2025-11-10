const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const externalService = require('../services/externalService');
const { ObjectId } = require('mongodb');

const getAllPayments = async (req, res, next) => {
     try {
          const database = db.getDb();
          const payments = await database.collection('payments')
               .find({})
               .sort({ created_at: -1 })
               .limit(100)
               .toArray();

          req.logger.info(`Retrieved ${payments.length} payments`);
          res.json({ data: payments, count: payments.length });
     } catch (error) {
          req.logger.error('Error fetching payments:', error);
          next(error);
     }
};

const getPaymentById = async (req, res, next) => {
     try {
          const { id } = req.params;

          if (!ObjectId.isValid(id)) {
               return res.status(400).json({ error: 'Invalid payment ID format' });
          }

          const database = db.getDb();
          const payment = await database.collection('payments')
               .findOne({ _id: new ObjectId(id) });

          if (!payment) {
               return res.status(404).json({ error: 'Payment not found' });
          }

          req.logger.info(`Retrieved payment ${id}`);
          res.json({ data: payment });
     } catch (error) {
          req.logger.error('Error fetching payment:', error);
          next(error);
     }
};

const getPaymentByTripId = async (req, res, next) => {
     try {
          const { tripId } = req.params;
          const database = db.getDb();
          const payments = await database.collection('payments')
               .find({ trip_id: tripId })
               .sort({ created_at: -1 })
               .toArray();

          req.logger.info(`Retrieved payments for trip ${tripId}`);
          res.json({ data: payments, count: payments.length });
     } catch (error) {
          req.logger.error('Error fetching payment by trip:', error);
          next(error);
     }
};

const chargePayment = async (req, res, next) => {
     const client = db.getClient();
     const session = client.startSession();

     try {
          const { trip_id, rider_id, amount, currency = 'USD', idempotency_key } = req.body;

          if (!trip_id || !rider_id || !amount) {
               return res.status(400).json({ error: 'Missing required fields: trip_id, rider_id, amount' });
          }

          await session.withTransaction(async () => {
               const database = db.getDb();

               // Check idempotency
               if (idempotency_key) {
                    const existingPayment = await database.collection('payments')
                         .findOne({ idempotency_key }, { session });

                    if (existingPayment) {
                         req.logger.info(`Idempotent request detected for key ${idempotency_key}`);
                         return res.json({
                              data: existingPayment,
                              message: 'Payment already processed (idempotent)'
                         });
                    }
               }

               // Validate trip exists and is completed
               try {
                    const tripResponse = await externalService.callTripService(`/v1/trips/${trip_id}`, req.correlationId);
                    const trip = tripResponse.data;

                    if (trip.status !== 'COMPLETED') {
                         return res.status(400).json({ error: `Trip must be completed before payment. Current status: ${trip.status}` });
                    }
               } catch (error) {
                    return res.status(404).json({ error: 'Trip not found or unavailable' });
               }

               // Validate rider exists
               try {
                    await externalService.callRiderService(`/v1/riders/${rider_id}`, req.correlationId);
               } catch (error) {
                    return res.status(404).json({ error: 'Rider not found' });
               }

               // Generate transaction ID and idempotency key if not provided
               const transactionId = `TXN-${Date.now()}-${uuidv4().substring(0, 8)}`;
               const finalIdempotencyKey = idempotency_key || uuidv4();

               // Simulate payment processing (in production, integrate with payment gateway)
               const paymentStatus = simulatePaymentProcessing() ? 'SUCCESS' : 'FAILED';
               const failureReason = paymentStatus === 'FAILED' ? 'Payment gateway declined' : null;
               const now = new Date();

               // Insert payment
               const payment = {
                    trip_id: trip_id.toString(),
                    rider_id: rider_id.toString(),
                    amount: parseFloat(amount),
                    currency,
                    status: paymentStatus,
                    transaction_id: transactionId,
                    idempotency_key: finalIdempotencyKey,
                    failure_reason: failureReason,
                    created_at: now,
                    updated_at: now,
                    processed_at: now,
                    payment_method: null
               };

               const paymentResult = await database.collection('payments').insertOne(payment, { session });
               const paymentId = paymentResult.insertedId.toString();

               let receipt = null;
               if (paymentStatus === 'SUCCESS') {
                    // Generate receipt
                    const receiptNumber = `RCP-${Date.now()}-${paymentId.substring(0, 8)}`;

                    // Fetch trip details for receipt
                    try {
                         const tripResponse = await externalService.callTripService(`/v1/trips/${trip_id}`, req.correlationId);
                         const trip = tripResponse.data;

                         const receiptDoc = {
                              payment_id: paymentId,
                              receipt_number: receiptNumber,
                              trip_distance: trip.distance_km || 0,
                              trip_fare: trip.total_fare || amount,
                              payment_amount: parseFloat(amount),
                              created_at: now
                         };

                         await database.collection('receipts').insertOne(receiptDoc, { session });

                         receipt = await database.collection('receipts')
                              .findOne({ payment_id: paymentId }, { session });
                    } catch (error) {
                         req.logger.warn('Could not create receipt:', error.message);
                    }
               }

               const createdPayment = await database.collection('payments')
                    .findOne({ _id: paymentResult.insertedId }, { session });

               req.logger.info(`Payment ${paymentId} processed with status ${paymentStatus} for trip ${trip_id}`);

               const response = {
                    data: createdPayment,
                    receipt: receipt
               };

               if (paymentStatus === 'FAILED') {
                    return res.status(402).json(response);
               }

               return res.status(201).json(response);
          });
     } catch (error) {
          if (error.code === 11000) {
               if (error.keyPattern && error.keyPattern.idempotency_key) {
                    // Retry to fetch existing payment
                    const database = db.getDb();
                    const existingPayment = await database.collection('payments')
                         .findOne({ idempotency_key: req.body.idempotency_key });
                    if (existingPayment) {
                         return res.json({
                              data: existingPayment,
                              message: 'Payment already processed (idempotent)'
                         });
                    }
               }
               return res.status(409).json({ error: 'Duplicate payment detected' });
          }

          req.logger.error('Error processing payment:', error);
          next(error);
     } finally {
          await session.endSession();
     }
};

const refundPayment = async (req, res, next) => {
     const client = db.getClient();
     const session = client.startSession();

     try {
          const { id } = req.params;
          const { reason } = req.body;

          if (!ObjectId.isValid(id)) {
               return res.status(400).json({ error: 'Invalid payment ID format' });
          }

          await session.withTransaction(async () => {
               const database = db.getDb();
               const payment = await database.collection('payments')
                    .findOne({ _id: new ObjectId(id) }, { session });

               if (!payment) {
                    return res.status(404).json({ error: 'Payment not found' });
               }

               if (payment.status !== 'SUCCESS') {
                    return res.status(400).json({ error: `Payment cannot be refunded. Current status: ${payment.status}` });
               }

               // Simulate refund processing
               const refundStatus = simulateRefundProcessing() ? 'REFUNDED' : 'FAILED';

               const result = await database.collection('payments').findOneAndUpdate(
                    { _id: new ObjectId(id) },
                    {
                         $set: {
                              status: refundStatus,
                              failure_reason: refundStatus === 'FAILED' ? 'Refund processing failed' : reason || null,
                              updated_at: new Date()
                         }
                    },
                    { returnDocument: 'after', session }
               );

               req.logger.info(`Payment ${id} refunded`);
               res.json({ data: result.value });
          });
     } catch (error) {
          req.logger.error('Error refunding payment:', error);
          next(error);
     } finally {
          await session.endSession();
     }
};

// Helper functions
function simulatePaymentProcessing() {
     // Simulate 95% success rate
     return Math.random() > 0.05;
}

function simulateRefundProcessing() {
     // Simulate 98% success rate
     return Math.random() > 0.02;
}

module.exports = {
     getAllPayments,
     getPaymentById,
     getPaymentByTripId,
     chargePayment,
     refundPayment
};
