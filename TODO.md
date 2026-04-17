# Add Product Image to Order Items - TODO

## Plan Steps:
- [x] 1. Create migration file for adding product_image column to order_items
- [x] 2. Edit controllers/orderController.js to fetch and store product_image during order placement  
- [x] 3. Update getOrderDetail query to include product_image in response
- [ ] 4. Run migration: `node scripts/run-migration.js migrations/0016_add_product_image_to_order_items.sql`
- [ ] 5. Test order creation and verify image storage
- [ ] 6. Task complete

**Next:** Step 1 - Migration creation
