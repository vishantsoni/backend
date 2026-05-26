# TODO

## Step 1

- Fix `getAllOrders` filter logic in `controllers/orderController.js`:
  - Ensure correct SQL precedence for `filter=my`.
  - Ensure `filter=distributor` matches ONLY `order_for LIKE 'distributor_%'`.

## Step 2

- Fix `placeOrder` target distributor selection in `controllers/orderController.js` based on `order_for`:
  - `admin-distributor` → distributor inventory deduction should target the distributor id referenced by `distributor_id` (or mapped from `order_for` if present).
  - `admin` → treat as main warehouse (`targetDistributorId=0`) unless explicit distributor_id is provided.
  - `distributor_%` → inventory deduction should target distributor id from the suffix.

## Step 3

- Fix return refund routing in `controllers/orderReturnController.js`:
  - If `order.payment_method === 'COD'`, do NOT attempt Razorpay refund.
  - If `order.payment_method` indicates Razorpay and `payment_status === 'paid'`, only then attempt Razorpay refund.

## Step 4

- Quick verification:
  - Run server / lint.
  - Validate `GET /orders?filter=my` and `GET /orders?filter=distributor`.
  - Create return and run refund for both COD and Razorpay.
