const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const isSuperAdmin = require('../middleware/isSuperAdmin');
const {
  placeOrder,
  getMyOrders,
  getAllOrders,
  getOrderDetail,
  updateOrderStatus,
  cancelOrder
} = require('../controllers/orderController');
const ecomAuth = require('../middleware/ecomAuth');

router.post('/', ecomAuth, placeOrder); // User place order
router.get('/my', ecomAuth, getMyOrders); // My orders

router.get('/', [authMiddleware, isSuperAdmin], getAllOrders); // Admin all
router.get('/details/:id',  getOrderDetail); // Detail (admin/user own)
router.put('/:id/status', [authMiddleware, isSuperAdmin], updateOrderStatus);
router.delete('/:id', [authMiddleware, isSuperAdmin], cancelOrder);

module.exports = router;