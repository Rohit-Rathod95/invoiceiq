const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
const { randomUUID } = require("crypto");

const s3 = new S3Client({ region: "us-east-1" });
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));
const lambda = new LambdaClient({ region: "us-east-1" });

const BUCKET_NAME = process.env.BUCKET_NAME;
const TABLE_NAME = process.env.TABLE_NAME;
const TEXTRACT_LAMBDA = process.env.TEXTRACT_LAMBDA;

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const fileBase64 = body.file;
    const fileName = body.fileName;

    if (!fileBase64 || !fileName) {
      return response(400, { error: "file and fileName are required" });
    }

    const invoiceId = randomUUID();
    const s3Key = `invoices/${invoiceId}/${fileName}`;
    const fileBuffer = Buffer.from(fileBase64, "base64");

    // Upload PDF to S3
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: "application/pdf",
    }));

    // Create DynamoDB record with PROCESSING status
    const ttl = Math.floor(Date.now() / 1000) + 86400; // 24 hours
    await dynamo.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        invoiceId,
        status: "PROCESSING",
        fileName,
        s3Key,
        ttl,
        createdAt: new Date().toISOString(),
      },
    }));

    // Trigger Lambda 2 asynchronously
    await lambda.send(new InvokeCommand({
      FunctionName: TEXTRACT_LAMBDA,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify({ invoiceId, s3Key })),
    }));

    return response(200, { invoiceId, status: "PROCESSING" });

  } catch (err) {
    console.error("UploadHandler error:", err);
    return response(500, { error: err.message });
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