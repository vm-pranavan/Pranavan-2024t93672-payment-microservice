const axios = require('axios');
const services = require('../config/services');

const callTripService = async (endpoint, correlationId) => {
     try {
          const response = await axios.get(`${services.tripService}${endpoint}`, {
               headers: { 'X-Correlation-Id': correlationId },
               timeout: 5000
          });
          return response.data;
     } catch (error) {
          if (error.response) {
               throw new Error(`Trip service error: ${error.response.status} - ${error.response.data.error || error.message}`);
          }
          throw new Error(`Trip service unavailable: ${error.message}`);
     }
};

const callRiderService = async (endpoint, correlationId) => {
     try {
          const response = await axios.get(`${services.riderService}${endpoint}`, {
               headers: { 'X-Correlation-Id': correlationId },
               timeout: 5000
          });
          return response.data;
     } catch (error) {
          if (error.response) {
               throw new Error(`Rider service error: ${error.response.status} - ${error.response.data.error || error.message}`);
          }
          throw new Error(`Rider service unavailable: ${error.message}`);
     }
};

module.exports = {
     callTripService,
     callRiderService
};
