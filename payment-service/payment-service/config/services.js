module.exports = {
     tripService: process.env.TRIP_SERVICE_URL || 'http://trip-service:3003',
     riderService: process.env.RIDER_SERVICE_URL || 'http://rider-service:3001'
};