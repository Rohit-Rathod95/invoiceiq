const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));

const TABLE_NAME = process.env.TABLE_NAME;

exports.handler = async (event) => {
  try {
    const invoiceId = event.pathParameters?.invoiceId;

    if (!invoiceId) {
      return response(400, { error: "invoiceId is required" });
    }

    const result = await dynamo.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { invoiceId },
    }));

    if (!result.Item) {
      return response(404, { error: "Invoice not found" });
    }

    const item = result.Item;

    // If still processing return just the status
    if (item.status === "PROCESSING" || item.status === "ANALYZING") {
      return response(200, {
        invoiceId,
        status: item.status,
      });
    }

    // If error return error message
    if (item.status === "ERROR") {
      return response(200, {
        invoiceId,
        status: "ERROR",
        errorMessage: item.errorMessage,
      });
    }

    // If DONE return full analysis
    return response(200, {
      invoiceId,
      status: "DONE",
      fileName: item.fileName,
      anomalies: item.anomalies,
      riskScore: item.riskScore,
      riskRationale: item.riskRationale,
      summary: item.summary,
      emailDraft: item.emailDraft,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    });

  } catch (err) {
    console.error("ResultsFetcher error:", err);
    return response(500, { error: "Internal server error" });
  }
};

const response = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  },
  body: JSON.stringify(body),
});