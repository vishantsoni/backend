# Blog Category API Documentation

Base URL: `/api/blog`

## Endpoints

### 1. Get All Categories

- **URL**: `GET /api/blog/categories`
- **Description**: Fetch all blog categories
- **Access**: Public
- **Response**:

```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "Health", "slug": "health" },
    { "id": 2, "name": "Wellness", "slug": "wellness" }
  ]
}
```

### 2. Get Category By ID

- **URL**: `GET /api/blog/categories/:id`
- **Description**: Fetch single category by ID
- **Access**: Public
- **Params**: `id` - Category ID
- **Response**:

```json
{
  "success": true,
  "data": { "id": 1, "name": "Health", "slug": "health" }
}
```

### 3. Create Category

- **URL**: `POST /api/blog/categories`
- **Description**: Create a new blog category
- **Access**: Admin
- **Body**:

```json
{
  "name": "Nutrition"
}
```

- **Response**:

```json
{
  "success": true,
  "data": { "id": 3, "name": "Nutrition", "slug": "nutrition" }
}
```

### 4. Update Category

- **URL**: `PUT /api/blog/categories/:id`
- **Description**: Update an existing category
- **Access**: Admin
- **Params**: `id` - Category ID
- **Body**:

```json
{
  "name": "Healthy Living"
}
```

- **Response**:

```json
{
  "success": true,
  "data": { "id": 1, "name": "Healthy Living", "slug": "healthy-living" }
}
```

### 5. Delete Category

- **URL**: `DELETE /api/blog/categories/:id`
- **Description**: Delete a category
- **Access**: Admin
- **Params**: `id` - Category ID
- **Note**: Posts linked to this category will have their `category_id` set to NULL (due to ON DELETE SET NULL)
- **Response**:

```json
{
  "success": true,
  "message": "Category deleted successfully"
}
```

## Error Responses

```json
// 404 - Not Found
{ "success": false, "message": "Category not found" }

// 400 - Duplicate
{ "success": false, "message": "Category already exists" }

// 500 - Server Error
{ "success": false, "message": "Error message" }
```
