const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

router.get('/', paymentController.getAllPayments);
router.get('/:id', paymentController.getPaymentById);
router.post('/charge', paymentController.chargePayment);
router.post('/:id/refund', paymentController.refundPayment);
router.get('/trip/:tripId', paymentController.getPaymentByTripId);

module.exports = router;
