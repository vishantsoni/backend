const express = require("express");
const router = express.Router();
const ticketController = require("../controllers/ticketController");
const auth = require("../middleware/authMiddleware");
const isAdmin = require("../middleware/isAdmin");
const isSuperAdmin = require("../middleware/isSuperAdmin");
const ecomAuth = require("../middleware/ecomAuth");

// Public: Raise ticket (no auth needed)
router.post("/raise-ticket", ticketController.raiseTicket);

// Auth required user routes
router.get("/my-tickets", ecomAuth, ticketController.getUserTickets);
router.get("/:caseId", ticketController.getTicketDetails);
router.post("/:caseId/reply", auth, ticketController.replyToTicket);

// distributor routes
router.get("/dis/my-tickets", auth, ticketController.getDistributorTickets);

// Admin routes
router.get(
  "/admin/all",
  auth,
  isSuperAdmin,
  ticketController.getAllTicketsAdmin,
);
router.put("/:id/status", auth, isAdmin, ticketController.updateTicketStatus);

module.exports = router;
