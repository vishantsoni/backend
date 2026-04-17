const db = require("../config/db");

exports.getAllAttributes = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        a.*,
        COALESCE(
          json_agg(
            json_build_object('id', av.id, 'value', av.value) 
            ORDER BY av.value
          ) FILTER (WHERE av.id IS NOT NULL), 
          '[]'
        ) as attrValues
      FROM attributes a
      LEFT JOIN attr_values av ON a.id = av.attr_id
      GROUP BY a.id, a.name
      ORDER BY a.id ASC
    `);
    res.status(200).json({
      success: true,
      message: "Attributes fetched successfully",
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching attributes:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.getAttrValuesByIds = async (req, res) => {
  try {
    const { attr_ids } = req.query;
    if (!attr_ids || attr_ids === '') {
      return res.status(400).json({
        success: false,
        message: 'attr_ids query parameter is required (comma-separated IDs)'
      });
    }
    const ids = attr_ids.toString().split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    if (ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid attr_ids parameter - no valid IDs found'
      });
    }
    const result = await db.query(
      'SELECT av.*, a.name as attr_name FROM attr_values av JOIN attributes a ON av.attr_id = a.id WHERE av.attr_id = ANY($1::int[]) ORDER BY av.attr_id, av.value ASC',
      [ids]
    );
    res.status(200).json({
      success: true,
      message: "Attribute values fetched successfully",
      data: result.rows
    });
  } catch (error) {
    console.error("Error fetching attribute values by IDs:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};


exports.getAttrValues = async (req, res) => {
  try {
    const { attrId } = req.params;
    if (!attrId || isNaN(parseInt(attrId))) {
      return res.status(400).json({
        success: false,
        message: "Valid attrId (number) is required",
      });
    }
    const attr_id = parseInt(attrId);
    const result = await db.query(
      "SELECT * FROM attr_values WHERE attr_id = $1 ORDER BY value ASC",
      [attr_id],
    );
    res.status(200).json({
      success: true,
      message: "Attribute values fetched successfully",
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching attribute values:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.createAttribute = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Attribute name is required and must be a non-empty string",
      });
    }
    const result = await db.query(
      "INSERT INTO attributes (name) VALUES ($1) RETURNING *",
      [name.trim()],
    );
    res.status(201).json({
      success: true,
      message: "Attribute created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      // unique violation
      return res.status(400).json({
        success: false,
        message: "Attribute name already exists",
      });
    }
    console.error("Error creating attribute:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.updateAttribute = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (
      !id ||
      isNaN(parseInt(id)) ||
      !name ||
      typeof name !== "string" ||
      name.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid id (number) and non-empty name are required",
      });
    }
    const attrId = parseInt(id);
    const result = await db.query(
      "UPDATE attributes SET name = $1 WHERE id = $2 RETURNING *",
      [name.trim(), attrId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Attribute not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Attribute updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "Attribute name already exists",
      });
    }
    console.error("Error updating attribute:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.deleteAttribute = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: "Valid id (number) is required",
      });
    }
    const attrId = parseInt(id);
    const result = await db.query(
      "DELETE FROM attributes WHERE id = $1 RETURNING *",
      [attrId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Attribute not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Attribute deleted successfully (values cascaded)",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting attribute:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.createAttrValue = async (req, res) => {
  try {
    const { attrId } = req.params;
    const { value } = req.body;
    if (
      !attrId ||
      isNaN(parseInt(attrId)) ||
      !value ||
      typeof value !== "string" ||
      value.trim().length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid attrId (number) and non-empty value are required",
      });
    }
    const attr_id = parseInt(attrId);
    // Verify attr exists
    const attrCheck = await db.query(
      "SELECT id FROM attributes WHERE id = $1",
      [attr_id],
    );
    if (attrCheck.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Attribute not found",
      });
    }
    const result = await db.query(
      "INSERT INTO attr_values (attr_id, value) VALUES ($1, $2) RETURNING *",
      [attr_id, value.trim()],
    );
    res.status(201).json({
      success: true,
      message: "Attribute value created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "Attribute value already exists for this attribute",
      });
    }
    console.error("Error creating attribute value:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
