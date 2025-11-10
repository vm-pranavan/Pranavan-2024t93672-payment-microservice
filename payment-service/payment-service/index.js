require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createLogger, format, transports } = require('winston');
const { v4: uuidv4 } = require('uuid');
const paymentRoutes = require('./routes/paymentRoutes');
const db = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3004;

const logger = createLogger({
     format: format.combine(
          format.timestamp(),
          format.json()
     ),
     transports: [
          new transports.Console(),
          new transports.File({ filename: 'logs/payment-service.log' })
     ]
});

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
     req.correlationId = req.headers['x-correlation-id'] || uuidv4();
     req.logger = logger.child({ correlationId: req.correlationId });
     req.logger.info({
          method: req.method,
          path: req.path,
          ip: req.ip
     });
     res.setHeader('X-Correlation-Id', req.correlationId);
     next();
});

app.get('/health', (req, res) => {
     res.status(200).json({ status: 'healthy', service: 'payment-service' });
});

app.use('/v1/payments', paymentRoutes);

app.use((err, req, res, next) => {
     req.logger.error({
          error: err.message,
          stack: err.stack
     });
     res.status(err.status || 500).json({
          error: err.message || 'Internal server error',
          correlationId: req.correlationId
     });
});

db.init().then(() => {
     app.listen(PORT, () => {
          logger.info(`Payment Service running on port ${PORT}`);
     });
}).catch(err => {
     logger.error('Failed to initialize database:', err);
     process.exit(1);
});
