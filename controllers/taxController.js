const db = require("../config/db");

exports.getTax = async (req, res) => {
  console.log("get tax called");
  try {
    const { state_code, country_code, status } = req.query;
    let query = "SELECT * FROM tax_settings WHERE 1=1";
    const params = [];
    let paramIndex = 1;

    if (state_code) {
      query += ` AND state_code = $${paramIndex}`;
      params.push(state_code.trim().toUpperCase());
      paramIndex++;
    }

    if (country_code) {
      query += ` AND country_code = $${paramIndex}`;
      params.push(country_code.trim().toUpperCase());
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status.trim().toLowerCase());
      paramIndex++;
    }

    query += " ORDER BY id DESC";

    const result = await db.query(query, params);

    res.status(200).json({
      success: true,
      message: "Tax settings fetched successfully",
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching tax settings:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.getTaxById = async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id);

    if (isNaN(parsedId) || parsedId < 1) {
      return res.status(400).json({
        success: false,
        message: "Valid tax id (positive integer) is required",
      });
    }

    const result = await db.query("SELECT * FROM tax_settings WHERE id = $1", [
      parsedId,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tax setting not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Tax setting fetched successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error fetching tax setting:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.createTax = async (req, res) => {
  try {
    const {
      tax_name,
      tax_percentage,
      state_code,
      country_code,
      is_inclusive,
      status,
    } = req.body;

    if (
      !tax_name ||
      typeof tax_name !== "string" ||
      tax_name.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "tax_name is required and must be a non-empty string",
      });
    }

    const trimmedTaxName = tax_name.trim();
    if (trimmedTaxName.length > 50) {
      return res.status(400).json({
        success: false,
        message: "tax_name must not exceed 50 characters",
      });
    }

    if (
      tax_percentage === undefined ||
      tax_percentage === null ||
      isNaN(tax_percentage)
    ) {
      return res.status(400).json({
        success: false,
        message: "tax_percentage is required and must be a valid number",
      });
    }

    const parsedTaxPercentage = parseFloat(tax_percentage);
    if (parsedTaxPercentage < 0 || parsedTaxPercentage > 100) {
      return res.status(400).json({
        success: false,
        message: "tax_percentage must be between 0 and 100",
      });
    }

    const already = await db.query(
      `select * from tax_settings where tax_percentage = $1`,
      [parsedTaxPercentage],
    );

    if (already.rows.length > 0) {
      return res.status(202).json({
        success: false,
        message: "This tax is already exists.",
      });
    }

    const parsedInclusive =
      typeof is_inclusive === "boolean"
        ? is_inclusive
        : is_inclusive === "true"
        ? true
        : is_inclusive === "false"
        ? false
        : false;

    const result = await db.query(
      `INSERT INTO tax_settings (
        tax_name, tax_percentage, state_code, country_code, is_inclusive, status
      ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        trimmedTaxName,
        parsedTaxPercentage,
        state_code ? state_code.trim().toUpperCase() : null,
        country_code ? country_code.trim().toUpperCase() : "IN",
        parsedInclusive,
        status ? status.trim().toLowerCase() : "active",
      ],
    );

    res.status(201).json({
      success: true,
      message: "Tax setting created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Tax setting with this name and state/country already exists",
      });
    }
    console.error("Error creating tax setting:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.updateTax = async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id);

    if (isNaN(parsedId) || parsedId < 1) {
      return res.status(400).json({
        success: false,
        message: "Valid tax id (positive integer) is required",
      });
    }

    const {
      tax_name,
      tax_percentage,
      state_code,
      country_code,
      is_inclusive,
      status,
    } = req.body;

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (tax_name !== undefined) {
      if (typeof tax_name !== "string" || tax_name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: "tax_name must be a non-empty string",
        });
      }
      const trimmed = tax_name.trim();
      if (trimmed.length > 50) {
        return res.status(400).json({
          success: false,
          message: "tax_name must not exceed 50 characters",
        });
      }
      updates.push(`tax_name = $${paramIndex}`);
      values.push(trimmed);
      paramIndex++;
    }

    if (tax_percentage !== undefined) {
      if (isNaN(tax_percentage)) {
        return res.status(400).json({
          success: false,
          message: "tax_percentage must be a valid number",
        });
      }
      const parsed = parseFloat(tax_percentage);
      if (parsed < 0 || parsed > 100) {
        return res.status(400).json({
          success: false,
          message: "tax_percentage must be between 0 and 100",
        });
      }
      updates.push(`tax_percentage = $${paramIndex}`);
      values.push(parsed);
      paramIndex++;
    }

    if (state_code !== undefined) {
      updates.push(`state_code = $${paramIndex}`);
      values.push(state_code ? state_code.trim().toUpperCase() : null);
      paramIndex++;
    }

    if (country_code !== undefined) {
      updates.push(`country_code = $${paramIndex}`);
      values.push(country_code ? country_code.trim().toUpperCase() : "IN");
      paramIndex++;
    }

    if (is_inclusive !== undefined) {
      const parsedInclusive =
        typeof is_inclusive === "boolean"
          ? is_inclusive
          : is_inclusive === "true"
          ? true
          : is_inclusive === "false"
          ? false
          : false;
      updates.push(`is_inclusive = $${paramIndex}`);
      values.push(parsedInclusive);
      paramIndex++;
    }

    if (status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      values.push(status.trim().toLowerCase());
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    values.push(parsedId);

    const result = await db.query(
      `UPDATE tax_settings SET ${updates.join(
        ", ",
      )}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Tax setting not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Tax setting updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Tax setting with this name and state/country already exists",
      });
    }
    console.error("Error updating tax setting:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.deleteTax = async (req, res) => {
  try {
    const { id } = req.params;
    const parsedId = parseInt(id);

    if (isNaN(parsedId) || parsedId < 1) {
      return res.status(400).json({
        success: false,
        message: "Valid tax id (positive integer) is required",
      });
    }

    const result = await db.query(
      "DELETE FROM tax_settings WHERE id = $1 RETURNING *",
      [parsedId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Tax setting not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Tax setting deleted successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting tax setting:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
