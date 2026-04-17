const db = require("../config/db");

class StateCityController {
  // ===== STATES CRUD (Admin) =====
  static async createState(req, res) {
    try {
      const { name, status = "active" } = req.body;
      if (!name?.trim()) {
        return res.status(400).json({ message: "State name is required" });
      }

      const result = await db.query(
        "INSERT INTO states (name, status) VALUES ($1, $2) RETURNING id, name, status, created_at",
        [name.trim(), status],
      );

      res
        .status(201)
        .json({ message: "State created successfully", data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") {
        // unique violation
        return res.status(409).json({ message: "State already exists" });
      }
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  static async getAllStates(req, res) {
    try {
      const { status, limit = 50, offset = 0 } = req.query;
      const limitVal = parseInt(limit);
      const offsetVal = parseInt(offset);

      let query = "SELECT id, name, status, created_at FROM states";
      let countQuery = "SELECT COUNT(*)::int FROM states";

      let params = [];
      let conditions = [];

      // 1. Build Filter Conditions
      if (status) {
        params.push(status);
        conditions.push(`status = $${params.length}`); // Becomes $1
      }

      // 2. Inject WHERE clause into both queries if conditions exist
      if (conditions.length > 0) {
        const whereClause = " WHERE " + conditions.join(" AND ");
        query += whereClause;
        countQuery += whereClause;
      }

      // 3. Keep a copy of params for the count query
      // (The count query only needs filters, not LIMIT/OFFSET)
      const countParams = [...params];

      // 4. Add ORDER BY, LIMIT, and OFFSET to the main query
      // These will use the next available parameter numbers (e.g., $2 and $3)
      query += ` ORDER BY name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

      // 5. Push the pagination values to match the placeholders
      params.push(limitVal, offsetVal);

      // 6. Execute both queries concurrently
      const [states, countRes] = await Promise.all([
        db.query(query, params),
        db.query(countQuery, countParams),
      ]);

      const total = countRes.rows[0].count;

      // 7. Send uniform response
      res.json({
        success: true, // Included for consistency with your frontend checks
        data: states.rows,
        pagination: {
          total,
          limit: limitVal,
          offset: offsetVal,
          hasMore: offsetVal + states.rows.length < total,
        },
      });
    } catch (error) {
      console.error("Database Error:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }

  static async updateState(req, res) {
    try {
      const { id } = req.params;
      const { name, status } = req.body;

      // Use name === undefined to allow for empty strings if that's your logic,
      // but usually, we want to ensure there is actually data to change.
      if (name === undefined && status === undefined) {
        return res.status(400).json({
          success: false,
          message: "Provide name or status to update",
        });
      }

      const updates = [];
      const params = [];

      if (name !== undefined) {
        params.push(name.trim());
        updates.push(`name = $${params.length}`); // Becomes $1
      }

      if (status !== undefined) {
        params.push(status);
        updates.push(`status = $${params.length}`); // Becomes $2 (if name exists)
      }

      // Add the ID as the last parameter for the WHERE clause
      params.push(parseInt(id));
      const idParamIndex = params.length;

      // const query = `
      //   UPDATE states
      //   SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
      //   WHERE id = $${idParamIndex}
      //   RETURNING id, name, status
      // `;
      // To this:
      const query = `
  UPDATE states 
  SET ${updates.join(", ")}
  WHERE id = $${idParamIndex} 
  RETURNING id, name, status
`;

      const result = await db.query(query, params);

      if (result.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: "State not found",
        });
      }

      res.json({
        success: true,
        message: "State updated successfully",
        data: result.rows[0],
      });
    } catch (error) {
      // Unique violation error code
      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          message: "State name already exists",
        });
      }
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }

  static async deleteState(req, res) {
    try {
      const { id } = req.params;
      const result = await db.query(
        "DELETE FROM states WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM cities WHERE state_id = $1)",
        [parseInt(id)],
      );

      if (result.rowCount === 0) {
        return res
          .status(404)
          .json({ message: "State not found or has cities" });
      }

      res.json({ message: "State deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  // ===== CITIES CRUD (Admin) =====
  static async createCity(req, res) {
    try {
      const { name, state_id, status = "active" } = req.body;
      if (!name?.trim() || !state_id) {
        return res
          .status(400)
          .json({ message: "City name and state_id are required" });
      }

      const result = await db.query(
        "INSERT INTO cities (state_id, name, status) VALUES ($1, $2, $3) RETURNING id, state_id, name, status, created_at",
        [parseInt(state_id), name.trim(), status],
      );

      res
        .status(201)
        .json({ message: "City created successfully", data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505") {
        return res
          .status(409)
          .json({ message: "City already exists for this state" });
      }
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  //  static async getAllCities(req, res) {
  //   try {
  //     const { status, state_id, limit = 50, offset = 0 } = req.query;
  //     const limitVal = parseInt(limit);
  //     const offsetVal = parseInt(offset);

  //     let query = `
  //       SELECT c.id, c.state_id, s.name as state_name, c.name, c.status, c.created_at
  //       FROM cities c
  //       JOIN states s ON c.state_id = s.id
  //     `;
  //     let params = [];
  //     let conditions = [];

  //     // 1. Add Filter Conditions
  //     if (status) {
  //       params.push(status);
  //       conditions.push(`c.status = $${params.length}`);
  //     }
  //     if (state_id) {
  //       params.push(parseInt(state_id));
  //       conditions.push(`c.state_id = $${params.length}`);
  //     }

  //     if (conditions.length > 0) {
  //       query += " WHERE " + conditions.join(" AND ");
  //     }

  //     // 2. Setup Count Query BEFORE adding pagination params to the array
  //     const countParams = [...params];
  //     const countQuery = `SELECT COUNT(*)::int FROM cities c ${conditions.length ? " WHERE " + conditions.join(" AND ") : ""}`;

  //     // 3. Add Pagination to Main Query
  //     // Use params.length + 1 and + 2 to reference the NEXT positions
  //     query += ` ORDER BY s.name, c.name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

  //     // Now push the actual values
  //     params.push(limitVal, offsetVal);

  //     // 4. Execute Queries
  //     const [citiesRes, totalRes] = await Promise.all([
  //       db.query(query, params),
  //       db.query(countQuery, countParams),
  //     ]);

  //     const total = totalRes.rows[0].count;

  //     res.json({
  //       success: true,
  //       data: citiesRes.rows,
  //       pagination: {
  //         total,
  //         limit: limitVal,
  //         offset: offsetVal,
  //         hasMore: offsetVal + citiesRes.rows.length < total,
  //       },
  //     });
  //   } catch (error) {
  //     console.error("Cities Fetch Error:", error);
  //     res.status(500).json({ success: false, message: "Server error", error: error.message });
  //   }
  // }

  static async getAllCities(req, res) {
    try {
      // 1. Destructure and parse inputs
      const { status, state_id, limit = 100, offset = 0 } = req.query;
      const limitVal = parseInt(limit) || 50;
      const offsetVal = parseInt(offset) || 0;

      let params = [];
      let conditions = [];

      // 2. Build Dynamic Conditions
      if (status && status !== "all") {
        params.push(status);
        conditions.push(`c.status = $${params.length}`);
      }

      // CRITICAL FIX: Ensure state_id is treated as a filter if it exists
      if (state_id !== undefined && state_id !== null && state_id !== "") {
        params.push(parseInt(state_id));
        conditions.push(`c.state_id = $${params.length}`);
      }

      const whereClause =
        conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";

      // 3. Prepare Data Query
      // We reference the next two parameter positions for LIMIT and OFFSET
      const dataQuery = `
      SELECT c.id, c.state_id, s.name as state_name, c.name, c.status, c.created_at 
      FROM cities c 
      JOIN states s ON c.state_id = s.id
      ${whereClause}
      ORDER BY s.name, c.name 
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

      // 4. Prepare Count Query (Use a separate params array to avoid LIMIT/OFFSET mismatch)
      const countQuery = `
      SELECT COUNT(*)::int 
      FROM cities c 
      ${whereClause}
    `;

      // 5. Execute using separate parameter sets
      const dataParams = [...params, limitVal, offsetVal];
      const countParams = [...params];

      const [citiesRes, totalRes] = await Promise.all([
        db.query(dataQuery, dataParams),
        db.query(countQuery, countParams),
      ]);

      const total = totalRes.rows[0].count;

      res.json({
        success: true,
        data: citiesRes.rows,
        pagination: {
          total,
          limit: limitVal,
          offset: offsetVal,
          hasMore: offsetVal + citiesRes.rows.length < total,
        },
      });
    } catch (error) {
      console.error("Cities Fetch Error:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }

  static async updateCity(req, res) {
    try {
      const { id } = req.params;
      const { name, state_id, status } = req.body;

      if (!name && state_id === undefined && status === undefined) {
        return res
          .status(400)
          .json({ message: "Provide name, state_id or status to update" });
      }

      const updates = [];
      const params = [];

      if (name !== undefined) {
        updates.push("name = $" + params.length + 1);
        params.push(name.trim());
      }
      if (state_id !== undefined) {
        updates.push("state_id = $" + params.length + 1);
        params.push(parseInt(state_id));
      }
      if (status !== undefined) {
        updates.push("status = $" + params.length + 1);
        params.push(status);
      }

      params.push(parseInt(id));

      const result = await db.query(
        `UPDATE cities SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${params.length} RETURNING *`,
        params,
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: "City not found" });
      }

      res.json({ message: "City updated successfully", data: result.rows[0] });
    } catch (error) {
      if (error.code === "23505" || error.code === "23503") {
        return res
          .status(409)
          .json({ message: "Invalid data or duplicate name" });
      }
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  static async deleteCity(req, res) {
    try {
      const { id } = req.params;
      const result = await db.query("DELETE FROM cities WHERE id = $1", [
        parseInt(id),
      ]);

      if (result.rowCount === 0) {
        return res.status(404).json({ message: "City not found" });
      }

      res.json({ message: "City deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }

  // ===== PUBLIC ENDPOINTS =====
  static async getActiveStates(req, res) {
    try {
      const states = await db.query(
        "SELECT * FROM states WHERE status = 'active' ORDER BY name",
      );
      res.json({ status: true, data: states.rows });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  }

  static async getActiveCitiesByState(req, res) {
    try {
      const { stateId } = req.params;
      const stateIdNum = parseInt(stateId);
      const cities = await db.query(
        "SELECT id, name FROM cities WHERE state_id = $1 AND status = 'active' ORDER BY name",
        [stateIdNum],
      );
      res.json({ status: true, data: cities.rows });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  }
}

module.exports = StateCityController;
