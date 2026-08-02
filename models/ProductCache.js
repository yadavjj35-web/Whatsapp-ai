// path: models/ProductCache.js
import mongoose from 'mongoose';

const ProductCacheSchema = new mongoose.Schema(
  {
    productId: { type: String, index: true, required: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    source: { type: String, default: 'woocommerce' },
    ttl: { type: Date }, // optional expiry
    createdAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

ProductCacheSchema.index({ productId: 1, createdAt: -1 });

export default mongoose.models.ProductCache || mongoose.model('ProductCache', ProductCacheSchema);
