// path: routes/api.js
import express from 'express';
import authApiKey from '../middleware/authApiKey.js';
import { searchProducts, getProduct, featuredProducts, bestSellers } from '../controllers/wooController.js';
import { generateAiReply, sendText } from '../controllers/chatController.js';
import { createOrder, getOrder } from '../controllers/orderController.js';
import { validateBody } from '../middleware/validateInput.js';
import Joi from 'joi';

const router = express.Router();

// Protect API routes with API key middleware
router.use(authApiKey);

// WooCommerce product proxy endpoints
router.get('/woo/search', searchProducts);
router.get('/woo/product/:id', getProduct);
router.get('/woo/featured', featuredProducts);
router.get('/woo/bestsellers', bestSellers);

// Chat endpoints
const generateSchema = Joi.object({
  phone: Joi.string().required(),
  lastUserMessage: Joi.string().required(),
  conversationHistory: Joi.array().items(Joi.object()).optional()
});
router.post('/chat/reply', validateBody(generateSchema), generateAiReply);

const sendSchema = Joi.object({
  phone: Joi.string().required(),
  text: Joi.string().required()
});
router.post('/chat/send', validateBody(sendSchema), sendText);

// Orders
const orderSchema = Joi.object({
  phone: Joi.string().required(),
  items: Joi.array().items(Joi.object({ product_id: Joi.number().required(), quantity: Joi.number().min(1).required() })).required(),
  shipping: Joi.object().optional(),
  billing: Joi.object().optional(),
  customer: Joi.object().optional()
});
router.post('/orders/create', validateBody(orderSchema), createOrder);
router.get('/orders/:id', getOrder);

export default router;
