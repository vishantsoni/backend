const db = require("../config/db");

const buildDateRange = (from, to, alias = "t") => {
  let clause = "";
  const params = [];
  if (from) {
    params.push(from);
    clause += ` AND ${alias}.created_at >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    clause += ` AND ${alias}.created_at::date = $${params.length}::date`;
  }
  return { clause, params };
};

// @desc    Get TDS Report (withdraw transactions where remarks contain 'TDS Deduction')
// @route   GET /api/reports/tds
exports.getTdsReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    const { clause: dateClause, params: dateParams } = buildDateRange(
      from,
      to,
      "t",
    );

    const whereClause = `
      WHERE 1=1
      AND t.category = 'withdraw'
      AND t.remarks ILIKE '%TDS Deduction%'
      ${dateClause}
    `;

    const summaryQuery = `
      SELECT
        COUNT(*)::int as total_transactions,
        COALESCE(SUM(t.amount), 0)::numeric(18,2) as total_amount
      FROM transactions t
      ${whereClause}
    `;

    const listQuery = `
      SELECT
        t.id,
        t.created_at,
        t.user_id,
        t.amount,
        t.category,
        t.type,
        t.remarks
      FROM transactions t
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT 500
    `;

    const [summaryResult, listResult] = await Promise.all([
      db.query(summaryQuery, dateParams),
      db.query(listQuery, dateParams),
    ]);

    return res.json({
      success: true,
      data: {
        summary: summaryResult.rows[0],
        transactions: listResult.rows,
      },
      message: "TDS report fetched successfully",
    });
  } catch (error) {
    console.error("Error fetching TDS report:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// @desc    Export TDS Report Excel
// @route   GET /api/reports/tds-excel
exports.exportTdsReportExcel = async (req, res) => {
  try {
    const { from, to } = req.query;

    const { clause: dateClause, params: dateParams } = buildDateRange(
      from,
      to,
      "t",
    );

    const reportQuery = `
      SELECT
        t.id,
        t.created_at,
        t.user_id,
        t.amount,
        t.category,
        t.type,
        t.remarks
      FROM transactions t
      WHERE 1=1
        AND t.category = 'withdraw'
        AND t.remarks ILIKE '%TDS Deduction%'
        ${dateClause}
      ORDER BY t.created_at DESC
    `;

    const result = await db.query(reportQuery, dateParams);

    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("TDS Deduction Report");

    worksheet.columns = [
      { header: "Transaction ID", key: "id", width: 18 },
      { header: "Date", key: "created_at", width: 15 },
      { header: "User ID", key: "user_id", width: 12 },
      { header: "Amount", key: "amount", width: 15 },
      { header: "Category", key: "category", width: 12 },
      { header: "Type", key: "type", width: 10 },
      { header: "Remarks", key: "remarks", width: 45 },
    ];

    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "E91E63" },
      };
    });

    result.rows.forEach((row) => {
      worksheet.addRow({
        ...row,
        created_at: row.created_at
          ? new Date(row.created_at).toLocaleDateString()
          : "",
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=TDS_Report.xlsx`,
    );

    await workbook.xlsx.write(res);
    return res.end();
  } catch (error) {
    console.error("Excel Export Error (TDS):", error);
    res.status(500).json({ success: false, message: "Export failed" });
  }
};
