# TODO - Ticket read/unread logic

## Step 1 (done)

- Inspect ticket schema usage in code: routes/supportRoutes.js and controllers/ticketController.js

## Step 2 (done)

- Add DB table(s) needed for read/unread (ticket_reads) in init.sql (idempotent)

## Step 3 (done)

- Update ticketController:
  - Fix export statement
  - Update raiseTicket to initialize ticket_reads for raiser
  - Update getTicketDetails to:
    - auto-mark read for viewer on GET
    - return unread_badge (badge count) for raiser

## Step 4 (done)

- Update any routes if needed (auto-mark read on GET)

## Step 5 (next)

- Run quick node syntax check and (if available) run tests/server smoke
