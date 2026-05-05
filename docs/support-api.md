# Support Ticket System API Documentation

Base URL: `/api/support`

## Authentication

- **Public endpoints**: No token required
- **User endpoints**: `x-auth-token` header (from authMiddleware)
- **Admin endpoints**: `x-auth-token` + admin role (isAdmin middleware)
- req.user: { id, role, type? (DISTRIBUTOR/ECOM_USER/STAFF) }

## Endpoints

### 1. Raise Ticket (Public)

```
POST /raise-ticket
```

**Body:**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "subject": "Payment Issue",
  "message": "Detailed description...",
  "user_id": 123, // optional if logged in
  "user_type": "DISTRIBUTOR" // DISTRIBUTOR/ECOM_USER
}
```

**Response (201):**

```json
{
  "success": true,
  "caseId": "FS-2026-123456",
  "message": "Support ticket raised successfully..."
}
```

### 2. Get My Tickets (Auth)

```
GET /my-tickets
```

**Headers:** `x-auth-token: <token>`

**Response:**

```json
{
  "success": true,
  "tickets": [
    {
      "id": 1,
      "case_id": "FS-2026-123456",
      "subject": "Payment Issue",
      "status": "OPEN",
      "created_at": "2026-01-01T10:00:00Z"
    }
  ]
}
```

### 3. Get Ticket Details (Auth)

```
GET /:caseId
```

**Headers:** `x-auth-token: <token>`

**Response:**

```json
{
  "success": true,
  "ticket": { ...full ticket object },
  "replies": [
    {
      "id": 1,
      "ticket_id": 1,
      "replied_by": 123,
      "replied_by_type": "USER",
      "message": "Reply text",
      "is_admin": false,
      "created_at": "..."
    }
  ]
}
```

### 4. Reply to Ticket (Auth)

```
POST /:caseId/reply
```

**Headers:** `x-auth-token: <token>`

**Body:**

```json
{
  "message": "My reply here",
  "attachment": "/uploads/reply-img.jpg" // optional
}
```

**Response (201):**

```json
{
  "success": true,
  "reply": { ...new reply object }
}
```

### 5. List All Tickets (Admin)

```
GET /admin?page=1&limit=20&status=OPEN
```

**Headers:** `x-auth-token: <token>` (admin)

**Response:**

```json
{
  "success": true,
  "tickets": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### 6. Update Ticket Status (Admin)

```
PUT /:id/status
```

**Headers:** `x-auth-token: <token>` (admin)

**Body:**

```json
{
  "status": "RESOLVED" // OPEN|IN_PROGRESS|RESOLVED|CLOSED
}
```

**Response:**

```json
{
  "success": true,
  "ticket": {
    "case_id": "FS-2026-123456",
    "status": "RESOLVED"
  }
}
```

## Error Responses

```json
{
  "success": false,
  "error": "Description"
}
```

- 401: Unauthorized/No token
- 403: Forbidden (not admin)
- 404: Ticket not found
- 500: Server error

## Notes

- Case ID format: `FS-YYYY-XXXXXX`
- Status enum: OPEN, IN_PROGRESS, RESOLVED, CLOSED
- Test with valid JWT tokens from your auth system
- Attachments: Optional file path support (implement multer if needed)

**Frontend Integration Ready!**
