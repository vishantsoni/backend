# TODO - Invoice generation fix

## Step 1

- Add `regenerator-runtime` dependency and ensure it is loaded before `@pdf-lib/fontkit`.

## Step 2

- Update `utils/invoiceServiceNew.js` to polyfill `regeneratorRuntime` before requiring fontkit.

## Step 3

- Install dependencies: `npm install`.

## Step 4

- Re-run invoice generation and verify the PDF is created without `regeneratorRuntime` error.
